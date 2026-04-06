import { configureOperationalScriptRuntime } from "./_operational-runtime";
import { replayMetaDeadLetterPartitions } from "@/lib/meta/warehouse";
import { syncMetaReports } from "@/lib/sync/meta-sync";

async function main() {
  configureOperationalScriptRuntime();
  const { getMetaAuthoritativeBusinessOpsSnapshot } =
    await import("@/lib/meta/warehouse");
  const { buildMetaStateCheckOutput } =
    await import("@/lib/meta/authoritative-ops");
  const businessId = process.argv[2];
  const scope = process.argv[3] ?? null;
  if (!businessId) {
    console.error("usage: node --import tsx scripts/meta-replay-dead-letter.ts <businessId> [scope]");
    process.exit(1);
  }
  const result = await replayMetaDeadLetterPartitions({ businessId, scope: scope as never });
  const syncResult = await syncMetaReports(businessId);
  const snapshot = await getMetaAuthoritativeBusinessOpsSnapshot({ businessId }).catch(() => null);
  console.log(
    JSON.stringify(
      {
        businessId,
        outcome: result.outcome,
        replayedCount: result.changedCount,
        matchedCount: result.matchedCount,
        skippedActiveLeaseCount: result.skippedActiveLeaseCount,
        result: result.partitions,
        syncResult,
        authoritative: snapshot ? buildMetaStateCheckOutput(snapshot) : null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
