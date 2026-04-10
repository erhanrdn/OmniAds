import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ReviewerSeedResult {
  ok: boolean;
  reviewer: {
    email: string;
    password: string;
    passwordSource: "env" | "generated_runtime";
    role: string;
    emailVerified: boolean;
  };
  loginUrl: string;
  accessibleBusinesses: Array<{ id: string; name: string }>;
}

export async function seedReviewerAccount(): Promise<ReviewerSeedResult> {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/seed-reviewer-account.mjs"], {
    cwd: process.cwd(),
    env: process.env,
  });

  const payload = JSON.parse(stdout) as ReviewerSeedResult;
  if (!payload?.ok || !payload.reviewer?.email || !payload.reviewer?.password) {
    throw new Error("Reviewer seed script did not return login credentials.");
  }

  return payload;
}
