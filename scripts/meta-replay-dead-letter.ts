import { replayMetaDeadLetterPartitions } from "@/lib/meta/warehouse";
import { syncMetaReports } from "@/lib/sync/meta-sync";

async function main() {
  const businessId = process.argv[2];
  const scope = process.argv[3] ?? null;
  if (!businessId) {
    console.error("usage: node --import tsx scripts/meta-replay-dead-letter.ts <businessId> [scope]");
    process.exit(1);
  }
  const result = await replayMetaDeadLetterPartitions({ businessId, scope: scope as never });
  const syncResult = await syncMetaReports(businessId);
  console.log(
    JSON.stringify(
      {
        businessId,
        outcome: result.outcome,
        replayedCount: result.changedCount,
        matchedCount: result.matchedCount,
        skippedActiveLeaseCount: result.skippedActiveLeaseCount,
        result: result.partitions,
        syncResult,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
