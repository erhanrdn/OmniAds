import { neon } from "@neondatabase/serverless";

/**
 * Returns a Neon SQL-tagged-template query function.
 * Uses DATABASE_URL by default (pooled connection).
 *
 * Usage:
 *   const sql = getDb();
 *   const rows = await sql`SELECT 1 AS ok`;
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Make sure your Neon database env vars are in .env.local",
    );
  }
  return neon(url);
}
