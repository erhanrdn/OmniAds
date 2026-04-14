import { runWithLocalPostgres } from "@/scripts/local-postgres";

async function main() {
  const args = process.argv.slice(2);
  const separatorIndex = args.indexOf("--");
  const commandArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

  if (commandArgs.length === 0) {
    console.error(
      "usage: node --import tsx scripts/with-local-postgres.ts -- <command> [args...]",
    );
    process.exit(1);
  }

  const [command, ...rest] = commandArgs;
  await runWithLocalPostgres(command, rest);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
