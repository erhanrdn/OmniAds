import { getDb } from "@/lib/db";

function parseMode(argv: string[]) {
  const mode = argv[2]?.trim().toLowerCase();
  if (mode !== "on" && mode !== "off") {
    throw new Error("Usage: node --import tsx scripts/canonical-resolver-kill-switch.ts <on|off>");
  }
  return mode;
}

async function main() {
  const mode = parseMode(process.argv);
  const active = mode === "on";
  const sql = getDb();
  const now = new Date().toISOString();
  const existing = await sql.query<{ active: boolean; activated_at: string | null; updated_at: string | null }>(
    `
      SELECT active, activated_at, updated_at
      FROM admin_feature_flag_kill_switches
      WHERE key = 'canonical-resolver-v1'
      LIMIT 1
    `,
  );

  await sql.query(
    `
      INSERT INTO admin_feature_flag_kill_switches (
        key,
        active,
        activated_at,
        updated_at
      )
      VALUES ('canonical-resolver-v1', $1, CASE WHEN $1 THEN now() ELSE NULL END, now())
      ON CONFLICT (key)
      DO UPDATE SET
        active = EXCLUDED.active,
        activated_at = CASE WHEN EXCLUDED.active THEN now() ELSE NULL END,
        updated_at = now()
    `,
    [active],
  );

  console.log(JSON.stringify({
    key: "canonical-resolver-v1",
    previous: existing[0] ?? null,
    active,
    flippedAt: now,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
