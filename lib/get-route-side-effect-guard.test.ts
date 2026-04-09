import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("GET route side-effect scanner guard", () => {
  it("reports zero GET/read-path write findings", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/check-request-path-side-effects.ts", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    );

    expect(result.status).toBe(0);

    const output = JSON.parse(result.stdout) as {
      findings: Array<{ type: string; file: string; summary: string }>;
    };

    const violations = output.findings.filter((finding) =>
      [
        "state_write_call",
        "projection_write_call",
        "cache_write_call",
        "refresh_trigger_call",
      ].includes(finding.type),
    );

    expect(violations).toEqual([]);
  });
});
