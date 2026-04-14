import {
  LOCAL_POSTGRES_DATA_DIR,
  LOCAL_POSTGRES_HOST,
  LOCAL_POSTGRES_PORT,
  ensureLocalPostgres,
} from "@/scripts/local-postgres";

try {
  const { started } = ensureLocalPostgres();
  if (started) {
    console.log(
      `[local-postgres] started ${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT} from ${LOCAL_POSTGRES_DATA_DIR}`,
    );
  } else {
    console.log(`[local-postgres] already running on ${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
