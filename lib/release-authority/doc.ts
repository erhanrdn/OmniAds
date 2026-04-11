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

  return `# V3-01 Release Authority

This document is generated from \`lib/release-authority/*\`. Do not hand-edit it.

Current accepted live baseline for this authority layer:

- current live SHA: \`${report.runtime.currentLiveSha}\`
- current main SHA: \`${report.runtime.currentMainSha ?? "unresolved"}\`
- rollback target before the next release: \`${report.release.previousKnownGoodSha}\`
- repository authority: \`${report.release.repository.fullName}\` \`${report.release.repository.branch}\`
- build info URL: \`${report.release.buildInfoUrl}\`
- release authority URL: \`${report.release.releaseAuthorityUrl}\`

## Literal parity

- live vs main: \`${report.verdicts.liveVsMain.status}\`
- docs vs runtime: \`${report.verdicts.docsVsRuntime.status}\`
- flags vs runtime: \`${report.verdicts.flagsVsRuntime.status}\`
- overall: \`${report.verdicts.overall.status}\`

## Feature Matrix

| Surface | Runtime posture | Docs posture | Flag posture | Notes |
| --- | --- | --- | --- | --- |
${matrixRows}

## Unresolved Drift

| Item | Status | Detail |
| --- | --- | --- |
${driftRows}

## Review Order

${report.reviewOrder.map((item, index) => `${index + 1}. ${item}`).join("\n")}
`;
}

export function readReleaseAuthorityCanonicalDoc() {
  return readFileSync(
    path.join(process.cwd(), RELEASE_AUTHORITY_CANONICAL_DOC),
    "utf8",
  );
}
