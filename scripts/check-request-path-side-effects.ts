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
}

interface RequestSurfaceRule {
  file: string;
  symbols: string[];
}

interface FunctionRange {
  name: string;
  start: number;
  end: number;
}

const repoRoot = process.cwd();

const routeEntrypoints = [
  "app/api/overview/route.ts",
  "app/api/overview-summary/route.ts",
  "app/api/overview-sparklines/route.ts",
  "app/api/auth/demo-login/route.ts",
  "app/api/creatives/share/[token]/route.ts",
  "app/api/meta/summary/route.ts",
  "app/api/meta/status/route.ts",
  "app/api/meta/campaigns/route.ts",
  "app/api/meta/breakdowns/route.ts",
  "app/api/meta/top-creatives/route.ts",
  "app/api/google-ads/overview/route.ts",
  "app/api/google-ads/status/route.ts",
  "app/api/google-ads/campaigns/route.ts",
  "app/api/google-ads/search-intelligence/route.ts",
  "app/api/oauth/shopify/context/route.ts",
  "app/api/oauth/shopify/pending/route.ts",
  "app/api/reports/route.ts",
  "app/api/reports/[reportId]/route.ts",
  "app/api/reports/[reportId]/export/route.ts",
  "app/api/reports/[reportId]/render/route.ts",
  "app/api/seo/overview/route.ts",
  "app/api/seo/findings/route.ts",
  "app/api/seo/ai-analysis/route.ts",
].map((value) => path.join(repoRoot, value));

const requestReadSurfaceRules: RequestSurfaceRule[] = [
  { file: "app/api/overview/route.ts", symbols: ["GET"] },
  { file: "app/api/overview-summary/route.ts", symbols: ["GET"] },
  { file: "app/api/overview-sparklines/route.ts", symbols: ["GET"] },
  { file: "app/api/auth/demo-login/route.ts", symbols: ["getDemoUserId", "GET"] },
  { file: "app/api/creatives/share/[token]/route.ts", symbols: ["GET"] },
  { file: "app/api/meta/summary/route.ts", symbols: ["GET"] },
  { file: "app/api/meta/status/route.ts", symbols: ["GET"] },
  { file: "app/api/meta/campaigns/route.ts", symbols: ["fetchAssignedAccountIds", "GET"] },
  { file: "app/api/meta/breakdowns/route.ts", symbols: ["fetchAssignedAccountIds", "GET"] },
  { file: "app/api/meta/top-creatives/route.ts", symbols: ["fetchAssignedAccountIds", "GET"] },
  { file: "app/api/google-ads/overview/route.ts", symbols: ["GET"] },
  { file: "app/api/google-ads/status/route.ts", symbols: ["GET"] },
  { file: "app/api/google-ads/campaigns/route.ts", symbols: ["GET"] },
  { file: "app/api/google-ads/search-intelligence/route.ts", symbols: ["GET"] },
  { file: "app/api/oauth/shopify/context/route.ts", symbols: ["GET"] },
  { file: "app/api/oauth/shopify/pending/route.ts", symbols: ["GET"] },
  { file: "app/api/reports/route.ts", symbols: ["GET"] },
  { file: "app/api/reports/[reportId]/route.ts", symbols: ["GET"] },
  { file: "app/api/reports/[reportId]/export/route.ts", symbols: ["GET"] },
  { file: "app/api/reports/[reportId]/render/route.ts", symbols: ["GET"] },
  { file: "app/api/seo/overview/route.ts", symbols: ["GET"] },
  { file: "app/api/seo/findings/route.ts", symbols: ["GET"] },
  { file: "app/api/seo/ai-analysis/route.ts", symbols: ["GET"] },
  { file: "lib/access.ts", symbols: ["findMembership", "listUserBusinesses", "requireAuthedRequest", "requireBusinessAccess"] },
  { file: "lib/auth.ts", symbols: ["findSessionByToken", "getSessionFromRequest", "getSessionFromCookies"] },
  { file: "lib/business-timezone.ts", symbols: ["resolveDerivedBusinessTimezone", "getBusinessTimezoneSnapshot"] },
  { file: "lib/business-mode.server.ts", symbols: ["isDemoBusiness", "resolveBusinessDataMode"] },
  { file: "lib/account-store.ts", symbols: ["getBusinessTimezone", "getUserByEmail", "getUserById"] },
  { file: "lib/business-cost-model.ts", symbols: ["getBusinessCostModel"] },
  { file: "lib/creative-share-store.ts", symbols: ["getCreativeShareSnapshot"] },
  { file: "lib/custom-report-store.ts", symbols: ["listCustomReportsByBusiness", "getCustomReportById", "getCustomReportShareSnapshot"] },
  { file: "lib/google-ads-gaql.ts", symbols: ["readGaqlFromDb", "writeGaqlToDb"] },
  { file: "lib/google-analytics-reporting.ts", symbols: ["logGa4QuotaUsage", "runGA4Report", "resolveGa4AnalyticsContext"] },
  { file: "lib/reporting-cache.ts", symbols: ["getSnapshotRow", "getSnapshotAge", "getCachedReport", "setCachedReport"] },
  { file: "lib/overview-service.ts", symbols: ["getMetaAccessContext"] },
  { file: "lib/overview-summary-store.ts", symbols: ["readOverviewSummaryRange", "upsertOverviewSummaryRows", "markOverviewSummaryRangeHydrated", "hydrateOverviewSummaryRangeFromMeta", "hydrateOverviewSummaryRangeFromGoogle"] },
  { file: "lib/provider-account-snapshots.ts", symbols: ["getSnapshotRow", "readProviderAccountSnapshot", "scheduleProviderAccountSnapshotRefresh", "requestProviderAccountSnapshotRefresh"] },
  { file: "lib/provider-request-governance.ts", symbols: ["hydrateFromDbIfNeeded", "persistCooldownToDb", "clearCooldownFromDb", "upsertExplicitCooldownState", "getProviderGlobalCircuitBreaker", "getProviderCircuitBreakerRecoveryState", "getProviderQuotaBudgetState", "logQuotaUsage"] },
  { file: "lib/meta/config-snapshots.ts", symbols: ["readLatestMetaConfigSnapshots", "readPreviousMetaConfigSnapshots", "readPreviousDifferentMetaConfigDiffs"] },
  { file: "lib/meta/warehouse.ts", symbols: ["getMetaPublishedVerificationSummary", "getLatestMetaSyncHealth", "getMetaSyncJobHealth", "getMetaQueueHealth", "getMetaQueueComposition", "getMetaAdDailyPreviewCoverage", "getMetaRawSnapshotCoverageByEndpoint", "getMetaSyncState", "getMetaAccountDailyStats", "getMetaAccountDailyRange", "getMetaCheckpointHealth", "getMetaDirtyRecentDates", "getMetaCampaignDailyRange", "getMetaAdSetDailyRange", "getMetaBreakdownDailyRange"] },
  { file: "lib/google-ads/warehouse.ts", symbols: ["readGoogleAdsDailyRange", "readGoogleAdsAggregatedRange", "getGoogleAdsDailyCoverage", "getGoogleAdsCoveredDates", "getGoogleAdsQueueHealth", "getGoogleAdsAdvisorQueueHealth", "getGoogleAdsPartitionHealth", "getGoogleAdsCheckpointHealth", "getGoogleAdsSyncState", "getLatestGoogleAdsSyncHealth"] },
  { file: "lib/seo/results-cache.ts", symbols: ["getSeoResultsCache", "setSeoResultsCache"] },
  { file: "lib/seo/monthly-ai-analysis-store.ts", symbols: ["getSeoMonthlyAiAnalysis"] },
  { file: "lib/shopify/install-context.ts", symbols: ["getShopifyInstallContext", "consumeShopifyInstallContext", "getLatestShopifyInstallContextForActor"] },
].map((rule) => ({
  ...rule,
  file: path.join(repoRoot, rule.file),
}));

const importGuardTargets = new Set(
  [
    "app/api/overview/route.ts",
    "app/api/overview-summary/route.ts",
    "app/api/overview-sparklines/route.ts",
    "app/api/auth/demo-login/route.ts",
    "app/api/creatives/share/[token]/route.ts",
    "app/api/meta/summary/route.ts",
    "app/api/meta/status/route.ts",
    "app/api/meta/campaigns/route.ts",
    "app/api/meta/breakdowns/route.ts",
    "app/api/meta/top-creatives/route.ts",
    "app/api/google-ads/overview/route.ts",
    "app/api/google-ads/status/route.ts",
    "app/api/google-ads/campaigns/route.ts",
    "app/api/google-ads/search-intelligence/route.ts",
    "app/api/oauth/shopify/context/route.ts",
    "app/api/oauth/shopify/pending/route.ts",
    "app/api/reports/route.ts",
    "app/api/reports/[reportId]/route.ts",
    "app/api/reports/[reportId]/export/route.ts",
    "app/api/reports/[reportId]/render/route.ts",
    "app/api/seo/overview/route.ts",
    "app/api/seo/findings/route.ts",
    "app/api/seo/ai-analysis/route.ts",
    "lib/access.ts",
    "lib/business-timezone.ts",
    "lib/business-mode.server.ts",
    "lib/google-ads-gaql.ts",
    "lib/google-analytics-reporting.ts",
    "lib/overview-service.ts",
    "lib/overview-summary-store.ts",
    "lib/provider-account-snapshots.ts",
    "lib/provider-request-governance.ts",
    "lib/seo/results-cache.ts",
  ].map((value) => path.join(repoRoot, value)),
);

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

const notes = [
  "Migration detection is function-scoped for mixed read/write modules such as lib/auth.ts, lib/account-store.ts, lib/meta/warehouse.ts, and lib/google-ads/warehouse.ts.",
  "Import guards only apply to route files and helper modules that should never depend on migrations at all; mixed repository files rely on the function-scoped scan instead.",
  "Legacy mutation, webhook, and worker migration entrypoints are intentionally not part of this read-surface guard; the phase only enforces no-migration for request-time read/access flows.",
];

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

function collectEvidenceInRange(
  content: string,
  pattern: RegExp,
  range: { start: number; end: number },
  limit = 5,
) {
  const evidence: Evidence[] = [];
  for (const match of content.matchAll(pattern)) {
    if (match.index == null) continue;
    if (match.index < range.start || match.index > range.end) continue;
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

function findBlockRange(content: string, declarationIndex: number) {
  let parenDepth = 0;
  let sawOpeningParen = false;
  for (let index = declarationIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "(") {
      parenDepth += 1;
      sawOpeningParen = true;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "{" && (!sawOpeningParen || parenDepth === 0)) {
      let braceDepth = 1;
      for (let cursor = index + 1; cursor < content.length; cursor += 1) {
        const nextChar = content[cursor];
        if (nextChar === "{") braceDepth += 1;
        if (nextChar === "}") braceDepth -= 1;
        if (braceDepth === 0) {
          return { start: declarationIndex, end: cursor };
        }
      }
      return { start: declarationIndex, end: content.length - 1 };
    }
  }
  return null;
}

function findFunctionRanges(content: string, symbol: string): FunctionRange[] {
  const patterns = [
    new RegExp(`export\\s+async\\s+function\\s+${symbol}\\b`, "g"),
    new RegExp(`export\\s+function\\s+${symbol}\\b`, "g"),
    new RegExp(`async\\s+function\\s+${symbol}\\b`, "g"),
    new RegExp(`function\\s+${symbol}\\b`, "g"),
    new RegExp(`const\\s+${symbol}\\s*=\\s*async\\s*\\(`, "g"),
    new RegExp(`const\\s+${symbol}\\s*=\\s*\\(`, "g"),
  ];

  const ranges: FunctionRange[] = [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match.index == null) continue;
      const range = findBlockRange(content, match.index);
      if (!range) continue;
      ranges.push({
        name: symbol,
        start: range.start,
        end: range.end,
      });
    }
  }

  return ranges;
}

function detectMigrationFindings(rule: RequestSurfaceRule, content: string): Finding[] {
  const findings: Finding[] = [];
  const repoPath = toRepoPath(rule.file);
  const ranges = rule.symbols.flatMap((symbol) => findFunctionRanges(content, symbol));
  const migrationEvidence = ranges.flatMap((range) =>
    collectEvidenceInRange(content, /\brunMigrations\s*\(/g, range),
  );

  if (migrationEvidence.length > 0) {
    findings.push({
      type: "migration_call",
      file: repoPath,
      summary: "Request-path surface contains runMigrations() inside a read-path function",
      evidence: migrationEvidence.slice(0, 5),
    });
  }

  if (importGuardTargets.has(rule.file)) {
    const importEvidence = collectEvidence(
      content,
      /import\s+[\s\S]*?\b(runMigrations)\b[\s\S]*?from\s+["']@\/lib\/migrations["']/g,
      5,
    );
    if (importEvidence.length > 0) {
      findings.push({
        type: "migration_import",
        file: repoPath,
        summary: "Request-path surface still imports runMigrations()",
        evidence: importEvidence,
      });
    }
  }

  return findings;
}

function detectGeneralFindings(filePath: string, content: string, inRequestGraph: boolean): Finding[] {
  const findings: Finding[] = [];
  const repoPath = toRepoPath(filePath);
  const lineCount = countLines(content);

  if (inRequestGraph) {
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
  const migrationFindings = requestReadSurfaceRules.flatMap((rule) =>
    fs.existsSync(rule.file) ? detectMigrationFindings(rule, readFile(rule.file)) : [],
  );
  const generalFindings = [...scannedFiles]
    .filter((filePath) => fs.existsSync(filePath))
    .flatMap((filePath) =>
      detectGeneralFindings(filePath, readFile(filePath), dependencyGraph.has(filePath)),
    );
  const findings = sortFindings([...migrationFindings, ...generalFindings]);

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          modulesScanned: scannedFiles.size,
          notes,
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
