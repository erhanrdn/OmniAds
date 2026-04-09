import fs from "node:fs";
import path from "node:path";

type FindingType =
  | "migration_call"
  | "state_write_call"
  | "cache_write_call"
  | "mixed_live_warehouse_projection"
  | "large_mixed_concern";

interface Evidence {
  line: number;
  snippet: string;
}

interface Finding {
  type: FindingType;
  file: string;
  summary: string;
  evidence: Evidence[];
}

const repoRoot = process.cwd();

const routeEntrypoints = [
  "app/api/overview/route.ts",
  "app/api/overview-summary/route.ts",
  "app/api/overview-sparklines/route.ts",
  "app/api/meta/summary/route.ts",
  "app/api/meta/status/route.ts",
  "app/api/meta/campaigns/route.ts",
  "app/api/meta/breakdowns/route.ts",
  "app/api/google-ads/overview/route.ts",
  "app/api/google-ads/status/route.ts",
  "app/api/google-ads/campaigns/route.ts",
  "app/api/google-ads/search-intelligence/route.ts",
].map((value) => path.join(repoRoot, value));

const mixedConcernTargets = new Set(
  [
    "lib/google-ads/serving.ts",
    "lib/google-ads/warehouse.ts",
    "lib/meta/serving.ts",
    "lib/migrations.ts",
    "lib/overview-service.ts",
    "app/api/overview-summary/route.ts",
    "app/(dashboard)/platforms/meta/page.tsx",
    "lib/shopify/read-adapter.ts",
  ].map((value) => path.join(repoRoot, value)),
);

function toRepoPath(filePath: string) {
  return path.relative(repoRoot, filePath) || filePath;
}

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function resolveModule(specifier: string, fromFile: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const basePath = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.normalize(candidate);
    }
  }

  return null;
}

function extractImportSpecifiers(content: string) {
  const specifiers = new Set<string>();
  const patterns = [
    /import\s+[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /export\s+[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function collectDependencyGraph(entrypoints: string[]) {
  const visited = new Set<string>();
  const queue = [...entrypoints.filter((value) => fs.existsSync(value))];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const content = readFile(current);
    for (const specifier of extractImportSpecifiers(content)) {
      const resolved = resolveModule(specifier, current);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return visited;
}

function lineForOffset(content: string, offset: number) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function collectEvidence(content: string, pattern: RegExp, limit = 5) {
  const evidence: Evidence[] = [];
  for (const match of content.matchAll(pattern)) {
    if (match.index == null) continue;
    evidence.push({
      line: lineForOffset(content, match.index),
      snippet: match[0].trim(),
    });
    if (evidence.length >= limit) break;
  }
  return evidence;
}

function hasMixedLiveWarehouseProjection(content: string) {
  const hasLive = /\blive\b|liveReport|liveTotals|current_day|current-day/i.test(content);
  const hasWarehouse = /\bwarehouse\b|_daily\b/i.test(content);
  const hasProjection =
    /\bprojection\b|platform_overview_daily_summary|platform_overview_summary_ranges/i.test(
      content,
    );
  return hasLive && hasWarehouse && hasProjection;
}

function countLines(content: string) {
  return content.split("\n").length;
}

function detectFindings(filePath: string, content: string, inRequestGraph: boolean): Finding[] {
  const findings: Finding[] = [];
  const repoPath = toRepoPath(filePath);
  const lineCount = countLines(content);

  if (inRequestGraph) {
    const migrationEvidence = collectEvidence(content, /\brunMigrations\s*\(/g);
    if (migrationEvidence.length > 0) {
      findings.push({
        type: "migration_call",
        file: repoPath,
        summary: "Request-path dependency contains runMigrations()",
        evidence: migrationEvidence,
      });
    }

    const stateWriteEvidence = collectEvidence(
      content,
      /\b(?:upsert|insert|hydrate|invalidate|mark)[A-Z][A-Za-z0-9_]*\s*\(/g,
    );
    if (stateWriteEvidence.length > 0) {
      findings.push({
        type: "state_write_call",
        file: repoPath,
        summary: "Request-path dependency contains write-like state/projection calls",
        evidence: stateWriteEvidence,
      });
    }

    const cacheWriteEvidence = collectEvidence(content, /\bsetCachedReport\s*\(/g);
    if (cacheWriteEvidence.length > 0) {
      findings.push({
        type: "cache_write_call",
        file: repoPath,
        summary: "Request-path dependency writes shared reporting cache",
        evidence: cacheWriteEvidence,
      });
    }

    if (hasMixedLiveWarehouseProjection(content)) {
      findings.push({
        type: "mixed_live_warehouse_projection",
        file: repoPath,
        summary: "Module mixes live, warehouse, and projection concerns",
        evidence: [
          {
            line: 1,
            snippet: "Detected live + warehouse + projection keywords in the same module",
          },
        ],
      });
    }
  }

  const shouldCheckMixedConcern = mixedConcernTargets.has(filePath) || lineCount >= 800;
  if (shouldCheckMixedConcern) {
    const hasFetch = /\bfetch\s*\(/.test(content);
    const hasSql = /\bSELECT\b|\bINSERT INTO\b|\bUPDATE\b|\bDELETE FROM\b|sql`/i.test(content);
    const hasRouteOrUiComposition =
      /NextResponse\.json|buildMetricCard|useQuery\s*\(|return\s*\(/.test(content);
    const concernCount = [hasFetch, hasSql, hasRouteOrUiComposition].filter(Boolean).length;

    if (lineCount >= 800 && concernCount >= 2) {
      findings.push({
        type: "large_mixed_concern",
        file: repoPath,
        summary: `Large mixed-concern file (${lineCount} lines)`,
        evidence: [
          {
            line: 1,
            snippet: `signals: fetch=${hasFetch}, sql=${hasSql}, compose=${hasRouteOrUiComposition}`,
          },
        ],
      });
    }
  }

  return findings;
}

function sortFindings(findings: Finding[]) {
  return [...findings].sort((left, right) => {
    if (left.file === right.file) {
      return left.type.localeCompare(right.type);
    }
    return left.file.localeCompare(right.file);
  });
}

function printReport(findings: Finding[], modulesScanned: number) {
  const grouped = new Map<FindingType, Finding[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.type) ?? [];
    bucket.push(finding);
    grouped.set(finding.type, bucket);
  }

  console.log("Request-path side-effect scan");
  console.log(`Modules scanned: ${modulesScanned}`);
  console.log(`Findings: ${findings.length}`);

  const sections: Array<[FindingType, string]> = [
    ["migration_call", "Migration calls"],
    ["state_write_call", "State/projection writes"],
    ["cache_write_call", "Cache writes"],
    ["mixed_live_warehouse_projection", "Mixed live/warehouse/projection modules"],
    ["large_mixed_concern", "Large mixed-concern files"],
  ];

  for (const [type, title] of sections) {
    const entries = grouped.get(type) ?? [];
    console.log(`\n${title}: ${entries.length}`);
    for (const entry of entries) {
      console.log(`- ${entry.file}: ${entry.summary}`);
      for (const item of entry.evidence) {
        console.log(`  - line ${item.line}: ${item.snippet}`);
      }
    }
  }
}

function main() {
  const dependencyGraph = collectDependencyGraph(routeEntrypoints);
  const scannedFiles = new Set<string>([...dependencyGraph, ...mixedConcernTargets]);
  const findings = sortFindings(
    [...scannedFiles]
      .filter((filePath) => fs.existsSync(filePath))
      .flatMap((filePath) =>
        detectFindings(filePath, readFile(filePath), dependencyGraph.has(filePath)),
      ),
  );

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          modulesScanned: scannedFiles.size,
          findings,
        },
        null,
        2,
      ),
    );
    return;
  }

  printReport(findings, scannedFiles.size);
}

main();
