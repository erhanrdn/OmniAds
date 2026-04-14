import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const LOCAL_POSTGRES_VOLUME_PATH =
  process.env.LOCAL_POSTGRES_VOLUME_PATH?.trim() || "/Volumes/adsecuteDB";
export const LOCAL_POSTGRES_DATA_DIR =
  process.env.LOCAL_POSTGRES_DATA_DIR?.trim() || path.join(LOCAL_POSTGRES_VOLUME_PATH, "postgres-data");
export const LOCAL_POSTGRES_LOG_DIR =
  process.env.LOCAL_POSTGRES_LOG_DIR?.trim() || path.join(LOCAL_POSTGRES_VOLUME_PATH, "postgres-logs");
export const LOCAL_POSTGRES_LOG_FILE =
  process.env.LOCAL_POSTGRES_LOG_FILE?.trim() || path.join(LOCAL_POSTGRES_LOG_DIR, "server-start.log");
export const LOCAL_POSTGRES_HOST = process.env.LOCAL_POSTGRES_HOST?.trim() || "127.0.0.1";
export const LOCAL_POSTGRES_PORT = Number(process.env.LOCAL_POSTGRES_PORT?.trim() || "5432");
export const LOCAL_POSTGRES_PG_CTL =
  process.env.LOCAL_POSTGRES_PG_CTL?.trim() || "/opt/homebrew/opt/postgresql@16/bin/pg_ctl";
export const LOCAL_POSTGRES_PG_ISREADY =
  process.env.LOCAL_POSTGRES_PG_ISREADY?.trim() || "/opt/homebrew/opt/postgresql@16/bin/pg_isready";

function commandExists(commandPath: string) {
  return fs.existsSync(commandPath);
}

function isVolumeMounted(volumePath: string) {
  const result = spawnSync("mount", { encoding: "utf8" });
  if (result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/)
    .some((line) => line.includes(` on ${volumePath} (`));
}

export function assertLocalPostgresPrerequisites() {
  if (!isVolumeMounted(LOCAL_POSTGRES_VOLUME_PATH)) {
    throw new Error(
      `adsecuteDB diski bagli degil. Lutfen ${LOCAL_POSTGRES_VOLUME_PATH} altinda mount edip tekrar deneyin.`,
    );
  }

  if (!fs.existsSync(LOCAL_POSTGRES_DATA_DIR)) {
    throw new Error(
      `Local PostgreSQL veri klasoru bulunamadi: ${LOCAL_POSTGRES_DATA_DIR}`,
    );
  }

  if (!commandExists(LOCAL_POSTGRES_PG_CTL)) {
    throw new Error(`pg_ctl bulunamadi: ${LOCAL_POSTGRES_PG_CTL}`);
  }

  if (!commandExists(LOCAL_POSTGRES_PG_ISREADY)) {
    throw new Error(`pg_isready bulunamadi: ${LOCAL_POSTGRES_PG_ISREADY}`);
  }
}

export function isLocalPostgresReady() {
  const result = spawnSync(
    LOCAL_POSTGRES_PG_ISREADY,
    ["-h", LOCAL_POSTGRES_HOST, "-p", String(LOCAL_POSTGRES_PORT)],
    { encoding: "utf8" },
  );
  return result.status === 0;
}

export function ensureLocalPostgres() {
  assertLocalPostgresPrerequisites();

  if (isLocalPostgresReady()) {
    return { started: false };
  }

  fs.mkdirSync(LOCAL_POSTGRES_LOG_DIR, { recursive: true });

  const startResult = spawnSync(
    LOCAL_POSTGRES_PG_CTL,
    [
      "-D",
      LOCAL_POSTGRES_DATA_DIR,
      "-l",
      LOCAL_POSTGRES_LOG_FILE,
      "start",
      "-w",
      "-t",
      "20",
    ],
    { encoding: "utf8" },
  );

  if (!isLocalPostgresReady()) {
    const stderr = startResult.stderr?.trim();
    const stdout = startResult.stdout?.trim();
    throw new Error(
      `Local PostgreSQL baslatilamadi.${stderr ? ` stderr: ${stderr}` : ""}${
        stdout ? ` stdout: ${stdout}` : ""
      }`,
    );
  }

  return { started: true };
}

export async function runWithLocalPostgres(command: string, args: string[]) {
  const { started } = ensureLocalPostgres();

  if (started) {
    console.log(
      `[local-postgres] started ${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT} from ${LOCAL_POSTGRES_DATA_DIR}`,
    );
  } else {
    console.log(`[local-postgres] already running on ${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}`);
  }

  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
