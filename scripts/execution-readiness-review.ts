import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

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
  const runtime = configureOperationalScriptRuntime();
  const json = process.argv.includes("--json");

  await runOperationalMigrationsIfEnabled(runtime);

  const { syncHealth } = await getAdminOperationsHealth();
  const globalReview = syncHealth.globalRebuildReview;
  const review = globalReview?.executionPostureReview;
  const workflow = globalReview?.workflow;

  if (!globalReview || !review || !workflow) {
    throw new Error("Global operator review is unavailable.");
  }

  const report = {
    capturedAt: new Date().toISOString(),
    workflow,
    rebuildTruth: {
      googleAds: globalReview.googleAds.rebuild,
      meta: globalReview.meta.rebuild,
      metaProtectedPublishedTruth: globalReview.meta.protectedPublishedTruth,
    },
    executionReadiness: globalReview.executionReadiness,
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

  console.log("Global operator review");
  console.log(`Captured at: ${report.capturedAt}`);
  console.log(`Workflow: ${workflow.adminSurface}`);
  console.log(`Review command: ${workflow.executionReviewCommand}`);
  console.log(`Ready means: ${workflow.readyMeans}`);
  console.log(`Auto-enable: ${workflow.automaticEnablement ? "on" : "off"}`);
  console.log(`Drilldown role: ${workflow.providerDrilldownRole}`);
  console.log(`Workflow summary: ${workflow.summary}`);
  console.log("");
  console.log("Global rebuild truth:");
  console.log(
    `- Google Ads: ${globalReview.googleAds.rebuild.state} (${globalReview.googleAds.rebuild.summary})`,
  );
  console.log(
    `- Meta: ${globalReview.meta.rebuild.state} (${globalReview.meta.rebuild.summary})`,
  );
  console.log(
    `- Meta protected published truth: ${globalReview.meta.protectedPublishedTruth.state} (${globalReview.meta.protectedPublishedTruth.summary})`,
  );
  console.log("");
  console.log("Execution readiness:");
  console.log(`- Gate: ${globalReview.executionReadiness.state}`);
  console.log(`- Summary: ${globalReview.executionReadiness.summary}`);
  printList(
    "Readiness blockers",
    globalReview.executionReadiness.dominantBlockers.map(
      (blocker) =>
        `${blocker.provider}: ${blocker.summary} (${blocker.evidence})`,
    ),
  );
  console.log("");
  console.log(`Decision: ${review.decision}`);
  console.log(`Gate: ${review.gateState}`);
  console.log(`Justified: ${review.strongerPostureJustified ? "yes" : "no"}`);
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
