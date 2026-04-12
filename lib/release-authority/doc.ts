import { readFileSync } from "node:fs";
import path from "node:path";
import { RELEASE_AUTHORITY_CANONICAL_DOC } from "@/lib/release-authority/config";
import type { ReleaseAuthorityReport } from "@/lib/release-authority/types";

function escapePipe(value: string) {
  return value.replaceAll("|", "\\|");
}

export function buildReleaseAuthorityCanonicalDoc(
  report: ReleaseAuthorityReport,
) {
  const matrixRows = report.surfaces
    .map((surface) => {
      const flags = surface.flagPosture
        ? `${surface.flagPosture.mode}: ${surface.flagPosture.flagKeys.join(", ")}`
        : "n/a";
      return `| \`${surface.label}\` | \`${surface.runtimeState}\` | \`${surface.docsState}\` | ${escapePipe(flags)} | ${escapePipe(surface.notes.join(" "))} |`;
    })
    .join("\n");

  const driftRows =
    report.unresolvedDriftItems.length === 0
      ? "| none | aligned | No unresolved drift items remain. |\n"
      : report.unresolvedDriftItems
          .map(
            (item) =>
              `| ${item.id} | ${item.status} | ${escapePipe(item.detail)} |`,
          )
          .join("\n");

  const carryForwardRows =
    report.carryForward.acceptanceGaps.length === 0
      ? "| none | complete | No accepted carry-forward gaps remain. | n/a |\n"
      : report.carryForward.acceptanceGaps
          .map(
            (item) =>
              `| ${item.label} | ${item.status} | ${escapePipe(item.detail)} | ${escapePipe(item.nextRequirement)} |`,
          )
          .join("\n");

  return `# V3-01 Release Authority

This document is generated from \`lib/release-authority/*\`. Do not hand-edit it.

Current accepted authority contract for this layer:

- runtime live SHA source: \`${report.release.buildInfoUrl}\`
- runtime release authority source: \`${report.release.releaseAuthorityUrl}\`
- repository authority: \`${report.release.repository.fullName}\` \`${report.release.repository.branch}\`
- canonical doc path: \`${report.release.featureAuthoritySource.canonicalDoc}\`
- rollback target before the next release: \`${report.release.previousKnownGoodSha}\`

## Literal parity

- build info URL must expose the same live SHA that \`/api/release-authority\` reports at runtime.
- \`/api/release-authority\` must expose the current remote \`${report.release.repository.branch}\` SHA.
- The rollback target in this doc must match the rollback target in \`/api/release-authority\`.
- The surface matrix below must stay literal with the release-authority inventory.

## Feature Matrix

| Surface | Runtime posture | Docs posture | Flag posture | Notes |
| --- | --- | --- | --- | --- |
${matrixRows}

## Unresolved Drift

| Item | Status | Detail |
| --- | --- | --- |
${driftRows}

## Carry-Forward Acceptance Gaps

${report.carryForward.summary}

| Item | Status | Detail | Next requirement |
| --- | --- | --- | --- |
${carryForwardRows}

## Review Order

1. Review release identity through \`/api/build-info\` and \`/api/release-authority\` first.
2. Review the feature matrix next: runtime state, flag posture, and docs posture for each surface.
3. Review \`${report.release.featureAuthoritySource.canonicalDoc}\` before older Phase 02-06 docs when deciding what is truly live.
4. Review legacy aliases after the main surfaces so redirects do not get mistaken for canonical entrypoints.
5. Resolve any unresolved drift items before treating the baseline as release-ready.
`;
}

export function readReleaseAuthorityCanonicalDoc() {
  return readFileSync(
    path.join(process.cwd(), RELEASE_AUTHORITY_CANONICAL_DOC),
    "utf8",
  );
}
