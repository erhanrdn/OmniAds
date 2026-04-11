import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");
const standaloneServerPath = path.join(standaloneDir, "server.js");

function syncDirectory(sourcePath, destinationPath) {
  if (!existsSync(sourcePath)) return;
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, {
    force: true,
    recursive: true,
  });
}

syncDirectory(path.join(rootDir, ".next", "static"), path.join(standaloneNextDir, "static"));
syncDirectory(path.join(rootDir, "public"), path.join(standaloneDir, "public"));

const server = spawn(process.execPath, [standaloneServerPath], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    ALLOW_INSECURE_LOCAL_AUTH_COOKIE:
      process.env.ALLOW_INSECURE_LOCAL_AUTH_COOKIE ?? "1",
    HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
    PORT: process.env.PORT ?? "3000",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) {
      server.kill(signal);
    }
  });
}

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
