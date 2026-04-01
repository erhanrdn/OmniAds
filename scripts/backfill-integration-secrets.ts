import { backfillIntegrationSecretsEncryption } from "@/lib/integrations";

async function main() {
  const result = await backfillIntegrationSecretsEncryption();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[backfill-integration-secrets] failed", error);
  process.exit(1);
});
