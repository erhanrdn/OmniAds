import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();

function fail(message: string): never {
  throw new Error(message);
}

function ensureFileContains(filePath: string, requiredSnippets: string[]) {
  const absolutePath = path.join(repoRoot, filePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: ${filePath}`);
  }
  const content = fs.readFileSync(absolutePath, "utf8");
  if (!content.trim()) {
    fail(`File is empty: ${filePath}`);
  }
  for (const snippet of requiredSnippets) {
    if (!content.includes(snippet)) {
      fail(`File ${filePath} is missing required snippet: ${snippet}`);
    }
  }
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function validateReadOnlySql(filePath: string) {
  const absolutePath = path.join(repoRoot, filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const normalized = stripSqlComments(content).toUpperCase();
  const forbidden = [
    /\bINSERT\s+INTO\b/,
    /\bUPDATE\s+[A-Z_]/,
    /\bDELETE\s+FROM\b/,
    /\bALTER\s+TABLE\b/,
    /\bCREATE\s+TABLE\b/,
    /\bDROP\s+TABLE\b/,
    /\bTRUNCATE\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(normalized)) {
      fail(`Read-only SQL check failed for ${filePath}: found forbidden statement ${pattern}`);
    }
  }
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  ensureFileContains("docs/architecture/db-dependency-map.md", [
    "## core",
    "## control",
    "## raw",
    "## warehouse",
    "## serving",
    "## audit",
  ]);
  ensureFileContains("docs/architecture/ui-api-dependency-map.md", [
    "## Overview surface",
    "## Meta surface",
    "## Google Ads surface",
    "## Shopify-connected surface",
  ]);
  ensureFileContains("docs/architecture/db-risk-register.md", [
    "## request path içinde migration",
    "## GET sırasında write",
    "## request sırasında lazy projection hydration",
    "## aynı endpoint içinde mixed live + warehouse + projection okuma",
    "## büyük multi-responsibility dosyalar",
    "## schema/state coupling",
  ]);
  ensureFileContains("docs/architecture/db-target-architecture.md", [
    "## Target layer model",
    "## Target data flow",
    "## direct-live lane exceptions",
    "## Safe implementation order",
  ]);
  ensureFileContains("docs/architecture/live-db-baseline-checks.sql", [
    "Projection vs warehouse parity checks",
    "Provider sanity aggregates",
  ]);
  validateReadOnlySql("docs/architecture/live-db-baseline-checks.sql");

  runCommand(process.execPath, [
    "--import",
    "tsx",
    "scripts/check-request-path-side-effects.ts",
  ]);

  runCommand(process.platform === "win32" ? "npm.cmd" : "npm", [
    "exec",
    "vitest",
    "run",
    "app/api/overview/route.test.ts",
    "app/api/overview-summary/route.test.ts",
    "app/api/overview-sparklines/route.test.ts",
  ]);
}

main();
