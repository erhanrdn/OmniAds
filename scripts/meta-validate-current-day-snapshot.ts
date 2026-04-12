import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ScriptArgs = {
  businessId: string | null;
  timeoutMs: number;
  pollMs: number;
};

type VerificationTarget = {
  providerAccountId: string;
  day: string;
};

type BusinessValidationPlan = {
  businessId: string;
  businessName: string;
  verificationTargets: VerificationTarget[];
  dirtyRows: Array<{
    providerAccountId: string;
    date: string;
    reasons: string[];
    severity: string;
  }>;
};

function parseArgs(argv: string[]): ScriptArgs {
  let businessId: string | null = null;
  let timeoutMs = 15 * 60 * 1000;
  let pollMs = 10_000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--business-id" || arg === "-b") && argv[index + 1]) {
      businessId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if ((arg === "--timeout-ms" || arg === "-t") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed;
      }
      index += 1;
      continue;
    }
    if ((arg === "--poll-ms" || arg === "-p") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        pollMs = parsed;
      }
      index += 1;
      continue;
    }
  }

  return {
    businessId,
    timeoutMs,
    pollMs,
  };
}

function getTodayIsoForTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(date: string, delta: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  configureOperationalScriptRuntime();

  const args = parseArgs(process.argv.slice(2));
  const { getDb } = await import("@/lib/db");
  const { resolveMetaCredentials } = await import("@/lib/api/meta");
  const {
    getMetaAuthoritativeDayVerification,
    getMetaDirtyRecentDates,
    getMetaQueueHealth,
  } = await import("@/lib/meta/warehouse");
  const {
    buildMetaPublishVerificationReport,
    buildMetaVerifyDayReport,
  } = await import("@/lib/meta/authoritative-ops");
  const {
    enqueueMetaScheduledWork,
    refreshMetaSyncStateForBusiness,
  } = await import("@/lib/sync/meta-sync");

  const sql = getDb();
  const businessRows = (await sql`
    SELECT id::text AS business_id, name AS business_name
    FROM businesses
    WHERE ${args.businessId ?? null}::text IS NULL OR id::text = ${args.businessId ?? null}
    ORDER BY name
  `) as Array<{ business_id: string; business_name: string }>;

  const plans: BusinessValidationPlan[] = [];

  for (const business of businessRows) {
    const credentials = await resolveMetaCredentials(business.business_id).catch(() => null);
    if (!credentials?.accountIds?.length) {
      continue;
    }

    const dirtyRows: BusinessValidationPlan["dirtyRows"] = [];
    const verificationTargets = new Map<string, VerificationTarget>();

    for (const providerAccountId of credentials.accountIds) {
      const timeZone =
        credentials.accountProfiles?.[providerAccountId]?.timezone ?? "UTC";
      const providerToday = getTodayIsoForTimeZone(timeZone);
      const d1 = addDays(providerToday, -1);
      const startDate = addDays(d1, -6);
      const dirty = await getMetaDirtyRecentDates({
        businessId: business.business_id,
        providerAccountId,
        startDate,
        endDate: d1,
      }).catch(() => []);

      verificationTargets.set(`${providerAccountId}:${d1}`, {
        providerAccountId,
        day: d1,
      });

      for (const row of dirty) {
        dirtyRows.push({
          providerAccountId: row.providerAccountId,
          date: row.date,
          reasons: row.reasons,
          severity: row.severity,
        });
        verificationTargets.set(`${row.providerAccountId}:${row.date}`, {
          providerAccountId: row.providerAccountId,
          day: row.date,
        });
      }
    }

    if (dirtyRows.length === 0 && !args.businessId) {
      continue;
    }

    plans.push({
      businessId: business.business_id,
      businessName: business.business_name,
      dirtyRows,
      verificationTargets: Array.from(verificationTargets.values()).sort((left, right) =>
        left.providerAccountId === right.providerAccountId
          ? left.day.localeCompare(right.day)
          : left.providerAccountId.localeCompare(right.providerAccountId),
      ),
    });
  }

  if (plans.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: args.businessId
            ? "No Meta accounts or recent dirty dates found for the requested business."
            : "No Meta businesses with recent dirty dates were found.",
          businesses: [],
        },
        null,
        2,
      ),
    );
    return;
  }

  const results = [];

  for (const plan of plans) {
    const enqueueResult = await enqueueMetaScheduledWork(plan.businessId);
    const queueTimeline = [];
    const deadline = Date.now() + args.timeoutMs;
    let queueHealth = await getMetaQueueHealth({ businessId: plan.businessId }).catch(() => null);

    while (queueHealth && Date.now() < deadline) {
      queueTimeline.push({
        capturedAt: new Date().toISOString(),
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        maintenanceQueueDepth: queueHealth.maintenanceQueueDepth,
        maintenanceLeasedPartitions: queueHealth.maintenanceLeasedPartitions,
        latestMaintenanceActivityAt: queueHealth.latestMaintenanceActivityAt,
      });
      if (queueHealth.queueDepth === 0 && queueHealth.leasedPartitions === 0) {
        break;
      }
      await sleep(args.pollMs);
      queueHealth = await getMetaQueueHealth({ businessId: plan.businessId }).catch(() => null);
    }

    await refreshMetaSyncStateForBusiness({ businessId: plan.businessId }).catch(() => null);

    const verification = [];
    let allVerified = true;
    for (const target of plan.verificationTargets) {
      const dayVerification = await getMetaAuthoritativeDayVerification({
        businessId: plan.businessId,
        providerAccountId: target.providerAccountId,
        day: target.day,
      });
      const verifyDay = buildMetaVerifyDayReport(dayVerification);
      const verifyPublish = buildMetaPublishVerificationReport(dayVerification);
      if (
        dayVerification.verificationState !== "finalized_verified" ||
        !verifyPublish.goNoGo.passed
      ) {
        allVerified = false;
      }
      verification.push({
        providerAccountId: target.providerAccountId,
        day: target.day,
        verifyDay,
        verifyPublish,
      });
    }

    results.push({
      businessId: plan.businessId,
      businessName: plan.businessName,
      dirtyRows: plan.dirtyRows,
      enqueueResult,
      queueDrained:
        (queueHealth?.queueDepth ?? 0) === 0 &&
        (queueHealth?.leasedPartitions ?? 0) === 0,
      queueHealth,
      queueTimeline,
      verification,
      ok: allVerified,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((result) => result.ok),
        timeoutMs: args.timeoutMs,
        pollMs: args.pollMs,
        workerCommand: "npm run worker:start",
        businesses: results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
