import { buildGoogleErrorBudgetAudit } from "@/lib/google-error-budget-audit";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function printBreakdown(label: string, breakdown: Record<string, number>) {
  console.log(
    `${label}: ${Object.entries(breakdown)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
  );
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const json = process.argv.includes("--json");

  await runOperationalMigrationsIfEnabled(runtime);
  const audit = await buildGoogleErrorBudgetAudit();

  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  console.log("Google API error-budget audit");
  console.log(`Captured at: ${audit.generatedAt}`);
  console.log(`Audit date: ${audit.auditDate}`);
  console.log(
    `Summary: requests=${audit.summary.requestCount}, errors=${audit.summary.errorCount}, cooldown_hits=${audit.summary.cooldownHitCount}, deduped=${audit.summary.dedupedCount}, active_cooldowns=${audit.summary.activeCooldowns}, active_circuit_breakers=${audit.summary.activeCircuitBreakers}`,
  );
  console.log(`Top error producer: ${audit.summary.topErrorProvider ?? "none"}`);
  console.log("");

  for (const provider of audit.providers) {
    console.log(provider.label);
    console.log(
      `- Requests=${provider.requestCount} errors=${provider.errorCount} error_rate=${formatPercent(provider.errorRate)} cooldown_hits=${provider.cooldownHitCount} deduped=${provider.dedupedCount}`,
    );
    console.log(
      `- Active suppression: cooldowns=${provider.activeCooldowns} circuit_breakers=${provider.activeCircuitBreakers}`,
    );
    printBreakdown("- Error classes", provider.errorClassBreakdown);
    if (provider.sourceBreakdown.length > 0) {
      console.log("- Sources:");
      for (const source of provider.sourceBreakdown) {
        console.log(
          `  ${source.source}: requests=${source.requestCount} errors=${source.errorCount} cooldown_hits=${source.cooldownHitCount} deduped=${source.dedupedCount}`,
        );
      }
    } else {
      console.log("- Sources: none");
    }
    if (provider.repeatedFailurePatterns.length > 0) {
      console.log("- Repeated failures:");
      for (const pattern of provider.repeatedFailurePatterns) {
        console.log(
          `  ${pattern.requestType} source=${pattern.source} path=${pattern.path ?? "n/a"} errors=${pattern.errorCount} cooldown_hits=${pattern.cooldownHitCount} class=${pattern.dominantFailureClass} active_cooldown=${pattern.activeCooldown ? "yes" : "no"}${pattern.cooldownUntil ? ` until=${pattern.cooldownUntil}` : ""}`,
        );
      }
    } else {
      console.log("- Repeated failures: none");
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
