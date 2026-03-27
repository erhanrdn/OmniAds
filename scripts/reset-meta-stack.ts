import { purgeAllMetaDataAndDisconnect } from "@/lib/meta/cleanup";

async function main() {
  const summary = await purgeAllMetaDataAndDisconnect();
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1]?.endsWith("reset-meta-stack.ts")) {
  main().catch((error) => {
    console.error("[reset-meta-stack] failed", error);
    process.exitCode = 1;
  });
}
