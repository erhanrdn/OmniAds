import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type FindingType =
  | "migration_call"
  | "migration_import"
  | "state_write_call"
  | "projection_write_call"
  | "cache_write_call"
  | "refresh_trigger_call"
  | "serving_write_owner_violation"
  | "mixed_live_warehouse_projection"
  | "large_mixed_concern";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

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

interface ImportBinding {
  localName: string;
  importedName: string | null;
  specifier: string;
  kind: "named" | "namespace" | "default";
  line: number;
  snippet: string;
}

interface ReExportBinding {
  exportName: string;
  importedName: string;
  specifier: string;
}

interface FunctionCall {
  type: "identifier" | "namespace";
  name?: string;
  namespace?: string;
  propertyName?: string;
  line: number;
  snippet: string;
}

interface FunctionInfo {
  name: string;
  line: number;
  exported: boolean;
  bodyText: string;
  calls: FunctionCall[];
}

interface ModuleInfo {
  filePath: string;
  content: string;
  sourceFile: ts.SourceFile;
  imports: Map<string, ImportBinding>;
  reExports: Map<string, ReExportBinding>;
  functions: Map<string, FunctionInfo>;
  lineCount: number;
  migrationImportEvidence: Evidence[];
  migrationCallEvidence: Evidence[];
}

interface RouteGraph {
  dependencies: Set<string>;
  parents: Map<string, string | null>;
}

interface ResolvedFunctionTarget {
  modulePath: string;
  functionName: string;
}

const repoRoot = process.cwd();
const routeRoot = path.join(repoRoot, "app");
const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);
const READ_ONLY_METHODS = new Set<HttpMethod>(["GET", "HEAD"]);
const readOnlyRouteExclusions = new Set([
  path.join(repoRoot, "app/api/oauth/google/callback/route.ts"),
  path.join(repoRoot, "app/api/oauth/meta/callback/route.ts"),
]);

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

const cacheWriteTargets = new Set([
  "setCachedReport",
  "setCachedRouteReport",
  "setSeoResultsCache",
  "writeCachedReportSnapshot",
  "writeCachedRouteReport",
  "writeSeoResultsCacheEntry",
]);
const projectionWriteTargets = new Set([
  "hydrateOverviewSummaryRangeFromMeta",
  "hydrateOverviewSummaryRangeFromGoogle",
  "upsertOverviewSummaryRows",
  "markOverviewSummaryRangeHydrated",
  "refreshOverviewSummaryFromMetaAccountRows",
  "refreshOverviewSummaryFromGoogleAccountRows",
  "materializeOverviewSummaryRows",
  "materializeOverviewSummaryRange",
  "materializeOverviewSummaryRangeFromMeta",
  "materializeOverviewSummaryRangeFromGoogle",
  "refreshOverviewSummaryMaterializationFromMetaAccountRows",
  "refreshOverviewSummaryMaterializationFromGoogleAccountRows",
  "clearOverviewSummaryRangeManifests",
]);
const stateWriteTargets = new Set([
  "upsertShopifyServingState",
  "insertShopifyReconciliationRun",
  "setSessionActiveBusiness",
  "persistShopifyOverviewServingState",
  "recordShopifyOverviewReconciliationRun",
]);
const refreshTriggerTargets = new Set([
  "requestProviderAccountSnapshotRefresh",
  "scheduleProviderAccountSnapshotRefresh",
  "forceProviderAccountSnapshotRefresh",
  "enqueueGoogleAdsScheduledWork",
  "enqueueMetaScheduledWork",
  "refreshGoogleAdsSyncStateForBusiness",
  "refreshMetaSyncStateForBusiness",
  "repairMetaWarehouseTruthRange",
  "repairCampaignRowsFromSnapshots",
  "repairAdSetRowsFromSnapshots",
]);
const servingWriteOwnerRules = [
  {
    surface: "overview_summary_projection",
    patterns: [
      /\bINSERT\s+INTO\s+platform_overview_daily_summary\b/i,
      /\bINSERT\s+INTO\s+platform_overview_summary_ranges\b/i,
      /\bDELETE\s+FROM\s+platform_overview_summary_ranges\b/i,
    ],
    allowedFiles: new Set([
      path.join(repoRoot, "lib/overview-summary-materializer.ts"),
    ]),
  },
  {
    surface: "user_facing_reporting_cache",
    patterns: [
      /\bINSERT\s+INTO\s+provider_reporting_snapshots\b/i,
      /\bDELETE\s+FROM\s+provider_reporting_snapshots\b/i,
      /\bUPDATE\s+provider_reporting_snapshots\b/i,
    ],
    allowedFiles: new Set([
      path.join(repoRoot, "lib/reporting-cache-writer.ts"),
      path.join(repoRoot, "lib/google-ads/warehouse.ts"),
      path.join(repoRoot, "scripts/reset-google-ads-stack.ts"),
    ]),
  },
  {
    surface: "seo_results_cache",
    patterns: [
      /\bINSERT\s+INTO\s+seo_results_cache\b/i,
      /\bDELETE\s+FROM\s+seo_results_cache\b/i,
      /\bUPDATE\s+seo_results_cache\b/i,
    ],
    allowedFiles: new Set([
      path.join(repoRoot, "lib/seo/results-cache-writer.ts"),
    ]),
  },
  {
    surface: "shopify_overview_serving_state",
    patterns: [
      /\bINSERT\s+INTO\s+shopify_reconciliation_runs\b/i,
      /\bINSERT\s+INTO\s+shopify_serving_state\b/i,
      /\bINSERT\s+INTO\s+shopify_serving_state_history\b/i,
      /\bUPDATE\s+shopify_serving_state\b/i,
      /\bDELETE\s+FROM\s+shopify_reconciliation_runs\b/i,
      /\bDELETE\s+FROM\s+shopify_serving_state\b/i,
    ],
    allowedFiles: new Set([
      path.join(repoRoot, "lib/shopify/overview-materializer.ts"),
    ]),
  },
] as const;

const notes = [
  "Migration detection still covers every Next HTTP route handler under app/**/route.ts.",
  "GET/HEAD write detection is now function-scoped: it starts from exported read handlers and follows local, named, and namespace imports transitively.",
  "Read-path findings are grouped as state writes, projection writes, durable cache writes, and refresh/repair triggers.",
  "OAuth callback GET routes that intentionally mutate integration/bootstrap state are excluded from read-only GET guard coverage.",
  "User-facing serving/projection/cache writes are also checked for explicit owner-module ownership; tiny allowlists cover out-of-scope admin/reset lanes only.",
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

function walkSourceFiles(currentPath: string, found: string[] = []) {
  if (!fs.existsSync(currentPath)) return found;
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walkSourceFiles(absolutePath, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|mts|cts|mjs)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx|mts|cts|mjs)$/.test(entry.name)) continue;
    found.push(path.normalize(absolutePath));
  }
  return found;
}

function discoverRouteEntrypoints() {
  return walkDir(routeRoot).sort((left, right) => left.localeCompare(right));
}

function discoverSourceFiles() {
  return [
    ...walkSourceFiles(path.join(repoRoot, "app")),
    ...walkSourceFiles(path.join(repoRoot, "lib")),
    ...walkSourceFiles(path.join(repoRoot, "scripts")),
  ].sort((left, right) => left.localeCompare(right));
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
  const globalPattern = pattern.global
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);
  for (const match of content.matchAll(globalPattern)) {
    if (match.index == null) continue;
    evidence.push({
      line: lineForOffset(content, match.index),
      snippet: match[0].trim(),
    });
    if (evidence.length >= limit) break;
  }
  return evidence;
}

function normalizeSnippet(snippet: string, maxLength = 220) {
  const normalized = snippet.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getNodeLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function hasExportModifier(node: ts.Node) {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
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

function collectFunctionCalls(
  sourceFile: ts.SourceFile,
  node: ts.FunctionLikeDeclarationBase,
): FunctionCall[] {
  const calls: FunctionCall[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      const line = getNodeLine(sourceFile, child);
      const snippet = normalizeSnippet(child.getText(sourceFile));
      if (ts.isIdentifier(child.expression)) {
        calls.push({
          type: "identifier",
          name: child.expression.text,
          line,
          snippet,
        });
      } else if (
        ts.isPropertyAccessExpression(child.expression) &&
        ts.isIdentifier(child.expression.expression)
      ) {
        calls.push({
          type: "namespace",
          namespace: child.expression.expression.text,
          propertyName: child.expression.name.text,
          line,
          snippet,
        });
      }
    }
    ts.forEachChild(child, visit);
  };

  if (node.body) {
    ts.forEachChild(node.body, visit);
  }

  return calls;
}

function createSourceFile(filePath: string, content: string) {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const moduleInfoCache = new Map<string, ModuleInfo>();

function getModuleInfo(filePath: string): ModuleInfo {
  const cached = moduleInfoCache.get(filePath);
  if (cached) return cached;

  const content = readFile(filePath);
  const sourceFile = createSourceFile(filePath, content);
  const imports = new Map<string, ImportBinding>();
  const reExports = new Map<string, ReExportBinding>();
  const functions = new Map<string, FunctionInfo>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (importClause?.name) {
        imports.set(importClause.name.text, {
          localName: importClause.name.text,
          importedName: "default",
          specifier,
          kind: "default",
          line: getNodeLine(sourceFile, statement),
          snippet: normalizeSnippet(statement.getText(sourceFile)),
        });
      }
      const namedBindings = importClause?.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        imports.set(namedBindings.name.text, {
          localName: namedBindings.name.text,
          importedName: null,
          specifier,
          kind: "namespace",
          line: getNodeLine(sourceFile, statement),
          snippet: normalizeSnippet(statement.getText(sourceFile)),
        });
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const localName = element.name.text;
          const importedName = (element.propertyName ?? element.name).text;
          imports.set(localName, {
            localName,
            importedName,
            specifier,
            kind: "named",
            line: getNodeLine(sourceFile, element),
            snippet: normalizeSnippet(element.getText(sourceFile)),
          });
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const exportName = element.name.text;
          const importedName = (element.propertyName ?? element.name).text;
          reExports.set(exportName, {
            exportName,
            importedName,
            specifier,
          });
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.set(statement.name.text, {
        name: statement.name.text,
        line: getNodeLine(sourceFile, statement),
        exported: hasExportModifier(statement),
        bodyText: statement.body.getText(sourceFile),
        calls: collectFunctionCalls(sourceFile, statement),
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (
          !ts.isArrowFunction(declaration.initializer) &&
          !ts.isFunctionExpression(declaration.initializer)
        ) {
          continue;
        }
        functions.set(declaration.name.text, {
          name: declaration.name.text,
          line: getNodeLine(sourceFile, declaration),
          exported,
          bodyText: declaration.initializer.body.getText(sourceFile),
          calls: collectFunctionCalls(sourceFile, declaration.initializer),
        });
      }
    }
  }

  const info: ModuleInfo = {
    filePath,
    content,
    sourceFile,
    imports,
    reExports,
    functions,
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

    const moduleInfo = getModuleInfo(current);
    const specifiers = new Set<string>();
    for (const binding of moduleInfo.imports.values()) {
      specifiers.add(binding.specifier);
    }
    for (const binding of moduleInfo.reExports.values()) {
      specifiers.add(binding.specifier);
    }

    for (const specifier of specifiers) {
      const resolved = resolveModule(specifier, current);
      if (!resolved || dependencies.has(resolved)) continue;
      if (!parents.has(resolved)) {
        parents.set(resolved, current);
      }
      queue.push(resolved);
    }
  }

  return { dependencies, parents };
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

function extractRouteMethods(filePath: string) {
  const methods: HttpMethod[] = [];
  for (const [name, fn] of getModuleInfo(filePath).functions.entries()) {
    if (fn.exported && HTTP_METHODS.has(name as HttpMethod)) {
      methods.push(name as HttpMethod);
    }
  }
  return methods.sort();
}

function resolveExportedFunction(
  modulePath: string,
  exportName: string,
  seen = new Set<string>(),
): ResolvedFunctionTarget | null {
  const loopKey = `${modulePath}:${exportName}`;
  if (seen.has(loopKey)) return null;
  seen.add(loopKey);

  const moduleInfo = getModuleInfo(modulePath);
  if (moduleInfo.functions.has(exportName)) {
    return { modulePath, functionName: exportName };
  }

  const reExport = moduleInfo.reExports.get(exportName);
  if (!reExport) {
    return null;
  }

  const resolvedModule = resolveModule(reExport.specifier, modulePath);
  if (!resolvedModule) {
    return null;
  }

  return resolveExportedFunction(resolvedModule, reExport.importedName, seen);
}

function getFindingTypeForTarget(targetName: string): FindingType | null {
  if (cacheWriteTargets.has(targetName)) return "cache_write_call";
  if (projectionWriteTargets.has(targetName)) return "projection_write_call";
  if (stateWriteTargets.has(targetName)) return "state_write_call";
  if (refreshTriggerTargets.has(targetName)) return "refresh_trigger_call";
  return null;
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

function detectGeneralFindings(filePath: string, inRouteGraph: boolean): Finding[] {
  const findings: Finding[] = [];
  const { content, lineCount } = getModuleInfo(filePath);
  const repoPath = toRepoPath(filePath);

  if (inRouteGraph && hasMixedLiveWarehouseProjection(content)) {
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

function detectServingWriteOwnerViolations(sourceFiles: string[]): Finding[] {
  const findings: Finding[] = [];

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    for (const rule of servingWriteOwnerRules) {
      if (rule.allowedFiles.has(filePath)) continue;
      const evidence = rule.patterns.flatMap((pattern) => collectEvidence(content, pattern, 2));
      if (evidence.length === 0) continue;
      findings.push({
        type: "serving_write_owner_violation",
        file: toRepoPath(filePath),
        summary: `Writes ${rule.surface} outside approved owner modules`,
        evidence,
      });
    }
  }

  return findings;
}

function detectMigrationFindings(input: {
  routeFile: string;
  routeMethods: HttpMethod[];
  graph: RouteGraph;
}): Finding[] {
  const findings: Finding[] = [];
  const routeRepoPath = toRepoPath(input.routeFile);

  for (const dependency of input.graph.dependencies) {
    const info = getModuleInfo(dependency);
    const dependencyRepoPath = toRepoPath(dependency);
    const chain = buildImportChain(input.graph.parents, dependency);
    const transitiveSource = dependency === input.routeFile ? null : dependencyRepoPath;
    const chainSuffix = chain.length > 1 ? ` via ${chain.join(" -> ")}` : "";

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

function createReadWriteFinding(input: {
  type: FindingType;
  routeFile: string;
  method: HttpMethod;
  call: FunctionCall;
  mutationTarget: string;
  chain: string[];
  transitiveSource: string | null;
}) {
  const routeRepoPath = toRepoPath(input.routeFile);
  const categoryLabel =
    input.type === "cache_write_call"
      ? "durable cache write"
      : input.type === "projection_write_call"
        ? "projection write"
        : input.type === "state_write_call"
          ? "state write"
          : "refresh/repair trigger";

  return {
    type: input.type,
    file: routeRepoPath,
    route: routeRepoPath,
    methods: [input.method],
    transitiveSource: input.transitiveSource,
    summary: `${input.method} route reaches ${categoryLabel} ${input.mutationTarget}()`,
    evidence: [
      {
        line: 1,
        snippet: input.chain.join(" -> "),
      },
      {
        line: input.call.line,
        snippet: input.call.snippet,
      },
    ],
  } satisfies Finding;
}

function detectReadPathWriteFindingsForRouteMethod(input: {
  routeFile: string;
  method: HttpMethod;
}): Finding[] {
  const findings: Finding[] = [];
  const visited = new Set<string>();

  const traceFunction = (target: ResolvedFunctionTarget, chain: string[]) => {
    const visitKey = `${target.modulePath}:${target.functionName}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const moduleInfo = getModuleInfo(target.modulePath);
    const fn = moduleInfo.functions.get(target.functionName);
    if (!fn) return;

    for (const call of fn.calls) {
      if (call.type === "identifier" && call.name) {
        const localTargetType = getFindingTypeForTarget(call.name);
        if (localTargetType) {
          findings.push(
            createReadWriteFinding({
              type: localTargetType,
              routeFile: input.routeFile,
              method: input.method,
              call,
              mutationTarget: call.name,
              chain,
              transitiveSource: toRepoPath(target.modulePath),
            }),
          );
          continue;
        }

        const localFunction = moduleInfo.functions.get(call.name);
        if (localFunction) {
          traceFunction(
            {
              modulePath: target.modulePath,
              functionName: call.name,
            },
            [...chain, `${toRepoPath(target.modulePath)}#${call.name}`],
          );
          continue;
        }

        const importBinding = moduleInfo.imports.get(call.name);
        if (!importBinding) continue;
        const resolvedModule = resolveModule(importBinding.specifier, target.modulePath);
        if (!resolvedModule) continue;
        const importedName = importBinding.importedName ?? call.name;
        const importTargetType = getFindingTypeForTarget(importedName);
        if (importTargetType) {
          findings.push(
            createReadWriteFinding({
              type: importTargetType,
              routeFile: input.routeFile,
              method: input.method,
              call,
              mutationTarget: importedName,
              chain,
              transitiveSource: toRepoPath(resolvedModule),
            }),
          );
          continue;
        }

        if (importBinding.kind === "namespace") continue;
        const resolvedTarget =
          importedName === "default"
            ? null
            : resolveExportedFunction(resolvedModule, importedName);
        if (!resolvedTarget) continue;
        traceFunction(
          resolvedTarget,
          [...chain, `${toRepoPath(resolvedTarget.modulePath)}#${resolvedTarget.functionName}`],
        );
        continue;
      }

      if (call.type === "namespace" && call.namespace && call.propertyName) {
        const importBinding = moduleInfo.imports.get(call.namespace);
        if (!importBinding || importBinding.kind !== "namespace") continue;
        const resolvedModule = resolveModule(importBinding.specifier, target.modulePath);
        if (!resolvedModule) continue;
        const targetType = getFindingTypeForTarget(call.propertyName);
        if (targetType) {
          findings.push(
            createReadWriteFinding({
              type: targetType,
              routeFile: input.routeFile,
              method: input.method,
              call,
              mutationTarget: call.propertyName,
              chain,
              transitiveSource: toRepoPath(resolvedModule),
            }),
          );
          continue;
        }

        const resolvedTarget = resolveExportedFunction(resolvedModule, call.propertyName);
        if (!resolvedTarget) continue;
        traceFunction(
          resolvedTarget,
          [...chain, `${toRepoPath(resolvedTarget.modulePath)}#${resolvedTarget.functionName}`],
        );
      }
    }
  };

  traceFunction(
    { modulePath: input.routeFile, functionName: input.method },
    [`${toRepoPath(input.routeFile)}#${input.method}`],
  );

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
      finding.evidence.map((item) => `${item.line}:${item.snippet}`).join("|"),
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
    ["state_write_call", "GET state writes"],
    ["projection_write_call", "GET projection writes"],
    ["cache_write_call", "GET durable cache writes"],
    ["refresh_trigger_call", "GET refresh/repair triggers"],
    ["serving_write_owner_violation", "Serving write-owner violations"],
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
    routeMethods: extractRouteMethods(routeFile),
    graph: collectRouteGraph(routeFile),
  }));

  const migrationFindings = routeGraphs.flatMap((entry) =>
    detectMigrationFindings({
      routeFile: entry.routeFile,
      routeMethods: entry.routeMethods,
      graph: entry.graph,
    }),
  );

  const getWriteFindings = routeGraphs.flatMap((entry) =>
    readOnlyRouteExclusions.has(entry.routeFile)
      ? []
      :
    entry.routeMethods
      .filter((method) => READ_ONLY_METHODS.has(method))
      .flatMap((method) =>
        detectReadPathWriteFindingsForRouteMethod({
          routeFile: entry.routeFile,
          method,
        }),
      ),
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
  const servingOwnerFindings = detectServingWriteOwnerViolations(discoverSourceFiles());

  const findings = sortFindings(
    dedupeFindings([
      ...migrationFindings,
      ...getWriteFindings,
      ...servingOwnerFindings,
      ...generalFindings,
    ]),
  );

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
