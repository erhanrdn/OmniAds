import { loadEnvConfig } from "@next/env";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

function printList(title: string, items: string[]) {
  console.log(`${title}:`);
  if (items.length === 0) {
    console.log("- none");
    return;
  }

  for (const item of items) {
    console.log(`- ${item}`);
  }
}

async function main() {
  const json = process.argv.includes("--json");

  await runMigrations();

  const { syncHealth } = await getAdminOperationsHealth();
  const review = syncHealth.globalRebuildReview?.executionPostureReview;
  const workflow = syncHealth.globalRebuildReview?.workflow;

  if (!review || !workflow) {
    throw new Error("Global execution posture review is unavailable.");
  }

  const report = {
    capturedAt: new Date().toISOString(),
    workflow,
    decision: review.decision,
    gateState: review.gateState,
    gateSummary: review.gateSummary,
    summary: review.summary,
    strongerPostureJustified: review.strongerPostureJustified,
    automaticEnablement: review.automaticEnablement,
    holdingProviders: review.holdingProviders,
    currentPosture: review.currentPosture,
    allowedNextStep: review.allowedNextStep,
    blockers: review.dominantBlockers,
    evidenceStillMissing: review.evidenceStillMissing,
    mustRemainManual: review.mustRemainManual,
    forbiddenEvenIfReady: review.forbiddenEvenIfReady,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Global execution posture review");
  console.log(`Captured at: ${report.capturedAt}`);
  console.log(`Workflow: ${workflow.adminSurface}`);
  console.log(`Decision: ${review.decision}`);
  console.log(`Gate: ${review.gateState}`);
  console.log(`Justified: ${review.strongerPostureJustified ? "yes" : "no"}`);
  console.log(`Auto-enable: ${review.automaticEnablement ? "on" : "off"}`);
  console.log(`Holding providers: ${review.holdingProviders.join(", ") || "none"}`);
  console.log(`Summary: ${review.summary}`);
  console.log(`Gate summary: ${review.gateSummary}`);
  console.log(`Allowed next step: ${review.allowedNextStep}`);
  console.log("");
  console.log("Current posture:");
  console.log(
    `- Google Ads sync: ${review.currentPosture.googleAds.sync.state} (${review.currentPosture.googleAds.sync.summary})`,
  );
  console.log(
    `- Google Ads retention: ${review.currentPosture.googleAds.retention.state} (${review.currentPosture.googleAds.retention.summary})`,
  );
  console.log(
    `- Meta finalization: ${review.currentPosture.meta.authoritativeFinalization.state} (${review.currentPosture.meta.authoritativeFinalization.summary})`,
  );
  console.log(
    `- Meta retention: ${review.currentPosture.meta.retention.state} (${review.currentPosture.meta.retention.summary})`,
  );
  console.log("");
  printList(
    "Dominant blockers",
    review.dominantBlockers.map(
      (blocker) =>
        `${blocker.provider}: ${blocker.summary} (${blocker.evidence})`,
    ),
  );
  console.log("");
  printList("Evidence still missing", review.evidenceStillMissing);
  console.log("");
  printList("Must remain manual", review.mustRemainManual);
  console.log("");
  printList("Forbidden even if ready", review.forbiddenEvenIfReady);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
