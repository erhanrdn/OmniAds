import fs from "node:fs";
import path from "node:path";

type FindingType =
  | "migration_call"
  | "migration_import"
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
  route?: string;
  methods?: string[];
  transitiveSource?: string | null;
}

interface ImportEntry {
  specifier: string;
  line: number;
  snippet: string;
}

interface ModuleInfo {
  filePath: string;
  content: string;
  imports: ImportEntry[];
  lineCount: number;
  migrationImportEvidence: Evidence[];
  migrationCallEvidence: Evidence[];
}

interface RouteGraph {
  dependencies: Set<string>;
  parents: Map<string, string | null>;
}

const repoRoot = process.cwd();
const routeRoot = path.join(repoRoot, "app");

const mixedConcernTargets = new Set(
  [
    "lib/google-ads/serving.ts",
    "lib/google-ads/warehouse.ts",
    "lib/meta/serving.ts",
    "lib/migrations.ts",
    "lib/overview-service.ts",
    "lib/shopify/read-adapter.ts",
    "app/api/overview-summary/route.ts",
    "app/(dashboard)/platforms/meta/page.tsx",
  ].map((value) => path.join(repoRoot, value)),
);

const notes = [
  "Migration detection now covers every Next HTTP route handler under app/**/route.ts and walks the transitive import graph.",
  "Each migration finding is anchored to the route entrypoint and, when possible, the first transitive module that still imports or calls runMigrations().",
  "Transitive detection is module-graph based; targeted route tests remain the final guard for dynamic branches inside large shared helpers.",
];

function toRepoPath(filePath: string) {
  return path.relative(repoRoot, filePath) || filePath;
}

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function walkDir(currentPath: string, found: string[] = []) {
  if (!fs.existsSync(currentPath)) return found;
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(absolutePath, found);
      continue;
    }
    if (entry.isFile() && absolutePath.endsWith(`${path.sep}route.ts`)) {
      found.push(path.normalize(absolutePath));
    }
  }
  return found;
}

function discoverRouteEntrypoints() {
  return walkDir(routeRoot).sort((left, right) => left.localeCompare(right));
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

function extractImportEntries(content: string) {
  const entries: ImportEntry[] = [];
  const patterns = [
    /import\s+[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /export\s+[\s\S]*?\sfrom\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (!match[1] || match.index == null) continue;
      entries.push({
        specifier: match[1],
        line: lineForOffset(content, match.index),
        snippet: match[0].trim(),
      });
    }
  }

  return entries;
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

const moduleInfoCache = new Map<string, ModuleInfo>();

function getModuleInfo(filePath: string): ModuleInfo {
  const cached = moduleInfoCache.get(filePath);
  if (cached) return cached;

  const content = readFile(filePath);
  const info: ModuleInfo = {
    filePath,
    content,
    imports: extractImportEntries(content),
    lineCount: content.split("\n").length,
    migrationImportEvidence: collectEvidence(
      content,
      /import\s+[\s\S]*?\brunMigrations\b[\s\S]*?from\s+["']@\/lib\/migrations["']|\{\s*runMigrations\s*\}\s*=\s*await\s*import\(\s*["']@\/lib\/migrations["']\s*\)/g,
      5,
    ),
    migrationCallEvidence: collectEvidence(content, /\brunMigrations\s*\(/g, 5),
  };

  moduleInfoCache.set(filePath, info);
  return info;
}

function collectRouteGraph(entrypoint: string): RouteGraph {
  const dependencies = new Set<string>();
  const parents = new Map<string, string | null>();
  const queue = [entrypoint];
  parents.set(entrypoint, null);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (dependencies.has(current)) continue;
    dependencies.add(current);

    for (const entry of getModuleInfo(current).imports) {
      const resolved = resolveModule(entry.specifier, current);
      if (!resolved || dependencies.has(resolved)) continue;
      if (!parents.has(resolved)) {
        parents.set(resolved, current);
      }
      queue.push(resolved);
    }
  }

  return { dependencies, parents };
}

function extractRouteMethods(content: string) {
  const methods = new Set<string>();
  for (const match of content.matchAll(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
  )) {
    if (match[1]) methods.add(match[1]);
  }
  return [...methods].sort();
}

function buildImportChain(parents: Map<string, string | null>, targetFile: string) {
  const chain: string[] = [];
  let current: string | null | undefined = targetFile;
  while (current) {
    chain.unshift(toRepoPath(current));
    current = parents.get(current) ?? null;
  }
  return chain;
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

function detectMigrationFindings(input: {
  routeFile: string;
  routeMethods: string[];
  graph: RouteGraph;
}): Finding[] {
  const findings: Finding[] = [];
  const routeRepoPath = toRepoPath(input.routeFile);

  for (const dependency of input.graph.dependencies) {
    const info = getModuleInfo(dependency);
    const dependencyRepoPath = toRepoPath(dependency);
    const chain = buildImportChain(input.graph.parents, dependency);
    const transitiveSource =
      dependency === input.routeFile ? null : dependencyRepoPath;
    const chainSuffix =
      chain.length > 1 ? ` via ${chain.join(" -> ")}` : "";

    if (info.migrationImportEvidence.length > 0) {
      findings.push({
        type: "migration_import",
        file: routeRepoPath,
        route: routeRepoPath,
        methods: input.routeMethods,
        transitiveSource,
        summary:
          dependency === input.routeFile
            ? `HTTP route imports runMigrations() directly (${input.routeMethods.join(", ") || "unknown"})`
            : `HTTP route transitively imports runMigrations() from ${dependencyRepoPath} (${input.routeMethods.join(", ") || "unknown"})${chainSuffix}`,
        evidence:
          dependency === input.routeFile
            ? info.migrationImportEvidence
            : [
                {
                  line: 1,
                  snippet: chain.join(" -> "),
                },
                ...info.migrationImportEvidence.slice(0, 2),
              ],
      });
    }

    if (info.migrationCallEvidence.length > 0) {
      findings.push({
        type: "migration_call",
        file: routeRepoPath,
        route: routeRepoPath,
        methods: input.routeMethods,
        transitiveSource,
        summary:
          dependency === input.routeFile
            ? `HTTP route calls runMigrations() directly (${input.routeMethods.join(", ") || "unknown"})`
            : `HTTP route transitively reaches runMigrations() in ${dependencyRepoPath} (${input.routeMethods.join(", ") || "unknown"})${chainSuffix}`,
        evidence:
          dependency === input.routeFile
            ? info.migrationCallEvidence
            : [
                {
                  line: 1,
                  snippet: chain.join(" -> "),
                },
                ...info.migrationCallEvidence.slice(0, 2),
              ],
      });
    }
  }

  return findings;
}

function detectGeneralFindings(filePath: string, inRouteGraph: boolean): Finding[] {
  const findings: Finding[] = [];
  const { content, lineCount } = getModuleInfo(filePath);
  const repoPath = toRepoPath(filePath);

  if (inRouteGraph) {
    const stateWriteEvidence = collectEvidence(
      content,
      /\b(?:upsert|insert|hydrate|invalidate|mark)[A-Z][A-Za-z0-9_]*\s*\(/g,
    );
    if (stateWriteEvidence.length > 0) {
      findings.push({
        type: "state_write_call",
        file: repoPath,
        summary: "HTTP-route dependency contains write-like state/projection calls",
        evidence: stateWriteEvidence,
      });
    }

    const cacheWriteEvidence = collectEvidence(content, /\bsetCachedReport\s*\(/g);
    if (cacheWriteEvidence.length > 0) {
      findings.push({
        type: "cache_write_call",
        file: repoPath,
        summary: "HTTP-route dependency writes shared reporting cache",
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

function dedupeFindings(findings: Finding[]) {
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const finding of findings) {
    const key = [
      finding.type,
      finding.file,
      finding.summary,
      finding.transitiveSource ?? "",
      (finding.methods ?? []).join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function sortFindings(findings: Finding[]) {
  return [...findings].sort((left, right) => {
    if (left.file === right.file) {
      return left.type.localeCompare(right.type);
    }
    return left.file.localeCompare(right.file);
  });
}

function printReport(findings: Finding[], modulesScanned: number, routesScanned: number) {
  const grouped = new Map<FindingType, Finding[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.type) ?? [];
    bucket.push(finding);
    grouped.set(finding.type, bucket);
  }

  console.log("HTTP-route side-effect scan");
  console.log(`Routes scanned: ${routesScanned}`);
  console.log(`Modules scanned: ${modulesScanned}`);
  console.log(`Findings: ${findings.length}`);
  for (const note of notes) {
    console.log(`Note: ${note}`);
  }

  const sections: Array<[FindingType, string]> = [
    ["migration_import", "Migration imports"],
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
      const routeSuffix = entry.route ? ` [route: ${entry.route}]` : "";
      console.log(`- ${entry.file}: ${entry.summary}${routeSuffix}`);
      for (const item of entry.evidence) {
        console.log(`  - line ${item.line}: ${item.snippet}`);
      }
    }
  }
}

function main() {
  const routeEntrypoints = discoverRouteEntrypoints();
  const routeGraphs = routeEntrypoints.map((routeFile) => ({
    routeFile,
    routeMethods: extractRouteMethods(getModuleInfo(routeFile).content),
    graph: collectRouteGraph(routeFile),
  }));

  const migrationFindings = routeGraphs.flatMap((entry) =>
    detectMigrationFindings({
      routeFile: entry.routeFile,
      routeMethods: entry.routeMethods,
      graph: entry.graph,
    }),
  );

  const allDependencies = new Set<string>();
  for (const routeGraph of routeGraphs) {
    for (const dependency of routeGraph.graph.dependencies) {
      allDependencies.add(dependency);
    }
  }
  for (const target of mixedConcernTargets) {
    if (fs.existsSync(target)) allDependencies.add(target);
  }

  const generalFindings = [...allDependencies]
    .filter((filePath) => fs.existsSync(filePath))
    .flatMap((filePath) => detectGeneralFindings(filePath, allDependencies.has(filePath)));

  const findings = sortFindings(dedupeFindings([...migrationFindings, ...generalFindings]));

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          routesScanned: routeEntrypoints.length,
          modulesScanned: allDependencies.size,
          notes,
          findings,
        },
        null,
        2,
      ),
    );
    return;
  }

  printReport(findings, allDependencies.size, routeEntrypoints.length);
}

main();
