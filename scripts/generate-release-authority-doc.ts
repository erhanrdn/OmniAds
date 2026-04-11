import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configureOperationalScriptRuntime } from "@/scripts/_operational-runtime";
import { RELEASE_AUTHORITY_CANONICAL_DOC } from "@/lib/release-authority/config";
import {
  resolveLocalGitHeadSha,
  resolveOriginMainSha,
} from "@/lib/release-authority/integrity";
import { buildReleaseAuthorityCanonicalDoc } from "@/lib/release-authority/doc";
import { buildReleaseAuthorityReport } from "@/lib/release-authority/report";

configureOperationalScriptRuntime();

async function main() {
  const report = buildReleaseAuthorityReport({
    currentLiveSha: resolveLocalGitHeadSha(),
    currentMainSha: resolveOriginMainSha(),
    currentMainShaSource: "git_remote",
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
  const output = buildReleaseAuthorityCanonicalDoc(report);
  const absolutePath = path.join(process.cwd(), RELEASE_AUTHORITY_CANONICAL_DOC);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, output, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        path: RELEASE_AUTHORITY_CANONICAL_DOC,
        currentLiveSha: report.runtime.currentLiveSha,
        currentMainSha: report.runtime.currentMainSha,
        previousKnownGoodSha: report.release.previousKnownGoodSha,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[generate-release-authority-doc] failed", error);
  process.exit(1);
});
