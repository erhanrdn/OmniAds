import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommercialSmokeSeedResult {
  ok: boolean;
  operator: {
    email: string;
    password: string;
    passwordSource: "env" | "generated_runtime";
    role: string;
  };
  loginUrl: string;
  businessId: string;
  executionBusinessId?: string | null;
}

export async function seedCommercialSmokeOperator(): Promise<CommercialSmokeSeedResult> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/seed-commercial-smoke-operator.mjs"],
    {
      cwd: process.cwd(),
      env: process.env,
    },
  );

  const payload = JSON.parse(stdout) as CommercialSmokeSeedResult;
  if (!payload?.ok || !payload.operator?.email || !payload.operator?.password) {
    throw new Error("Commercial smoke operator seed did not return credentials.");
  }
  return payload;
}
