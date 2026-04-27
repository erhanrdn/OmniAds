import { spawnSync } from "node:child_process";
import {
  evaluateCreativeDecisionOsV2Gold,
  readGoldLabelsV0,
} from "@/lib/creative-decision-os-v2-evaluation";

const focusedTestFiles = [
  "lib/creative-decision-os-v2.test.ts",
  "lib/creative-decision-os-v2-preview.test.tsx",
  "lib/creative-v2-no-write-enforcement.test.ts",
  "lib/get-route-side-effect-guard.test.ts",
  "src/services/data-service-ai.test.ts",
  "components/creatives/CreativeDecisionSupportSurface.test.tsx",
  "components/creatives/CreativesTableSection.test.tsx",
  "app/(dashboard)/creatives/page.test.tsx",
  "app/api/creatives/decision-os-v2/preview/route.test.ts",
];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

run("npx", ["vitest", "run", ...focusedTestFiles]);

const evaluation = evaluateCreativeDecisionOsV2Gold(readGoldLabelsV0());
const failures: string[] = [];

if (evaluation.macroF1 < 90) {
  failures.push(`macroF1 below 90: ${evaluation.macroF1}`);
}
if (evaluation.mismatchCounts.severe !== 0) {
  failures.push(`severe mismatches: ${evaluation.mismatchCounts.severe}`);
}
if (evaluation.mismatchCounts.high !== 0) {
  failures.push(`high mismatches: ${evaluation.mismatchCounts.high}`);
}
if (evaluation.queueApplySafety.watchPrimaryCount !== 0) {
  failures.push(`Watch primary outputs: ${evaluation.queueApplySafety.watchPrimaryCount}`);
}
if (evaluation.queueApplySafety.scaleReviewPrimaryCount !== 0) {
  failures.push(
    `Scale Review primary outputs: ${evaluation.queueApplySafety.scaleReviewPrimaryCount}`,
  );
}
if (evaluation.queueApplySafety.queueEligibleCount !== 0) {
  failures.push(`queue eligible outputs: ${evaluation.queueApplySafety.queueEligibleCount}`);
}
if (evaluation.queueApplySafety.applyEligibleCount !== 0) {
  failures.push(`apply eligible outputs: ${evaluation.queueApplySafety.applyEligibleCount}`);
}
if (evaluation.queueApplySafety.directScaleCount !== 0) {
  failures.push(`direct Scale outputs: ${evaluation.queueApplySafety.directScaleCount}`);
}
if (evaluation.queueApplySafety.inactiveDirectScaleCount !== 0) {
  failures.push(`inactive direct Scale outputs: ${evaluation.queueApplySafety.inactiveDirectScaleCount}`);
}

if (failures.length > 0) {
  throw new Error(`Creative v2 safety gate failed:\n${failures.join("\n")}`);
}

console.log(
  JSON.stringify(
    {
      creativeV2SafetyGate: "passed",
      artifactVersion: evaluation.artifactVersion,
      rowCount: evaluation.rowCount,
      macroF1: evaluation.macroF1,
      mismatchCounts: evaluation.mismatchCounts,
      queueApplySafety: evaluation.queueApplySafety,
    },
    null,
    2,
  ),
);
