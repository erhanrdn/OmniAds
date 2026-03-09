import { getDb } from "@/lib/db";
import type { CreativeMediaCacheRow } from "./types";

type Row = CreativeMediaCacheRow;

/**
 * Database CRUD for the creative_media_cache table.
 * All queries use the Neon SQL tagged-template pattern.
 */
export const CacheRepository = {
  /**
   * Batch-fetch cached entries for multiple creative IDs.
   * Only returns rows that are status='cached' and not expired.
   */
  async findCachedByCreativeIds(
    creativeIds: string[],
    businessId: string,
    provider: string
  ): Promise<Map<string, Row>> {
    if (creativeIds.length === 0) return new Map();
    const sql = getDb();
    const rows = (await sql`
      SELECT * FROM creative_media_cache
      WHERE creative_id = ANY(${creativeIds})
        AND business_id = ${businessId}
        AND provider = ${provider}
        AND status = 'cached'
        AND expires_at > now()
    `) as unknown as Row[];
    const map = new Map<string, Row>();
    for (const row of rows) {
      map.set(row.creative_id, row);
    }
    return map;
  },

  /**
   * Insert a pending cache entry, or update the source_url if one exists
   * (but only if it's not currently being downloaded).
   */
  async upsertPending(
    creativeId: string,
    businessId: string,
    provider: string,
    sourceUrl: string
  ): Promise<Row | null> {
    const sql = getDb();
    const rows = (await sql`
      INSERT INTO creative_media_cache
        (creative_id, business_id, provider, source_url, status)
      VALUES
        (${creativeId}, ${businessId}, ${provider}, ${sourceUrl}, 'pending')
      ON CONFLICT (creative_id, business_id, provider) DO UPDATE
        SET source_url = EXCLUDED.source_url,
            updated_at = now()
        WHERE creative_media_cache.status NOT IN ('downloading', 'cached')
      RETURNING *
    `) as unknown as Row[];
    return rows[0] ?? null;
  },

  /** Transition a pending row to downloading (returns false if already moved) */
  async setDownloading(id: string): Promise<boolean> {
    const sql = getDb();
    const rows = await sql`
      UPDATE creative_media_cache
      SET status = 'downloading', updated_at = now()
      WHERE id = ${id} AND status IN ('pending', 'failed')
      RETURNING id
    `;
    return rows.length > 0;
  },

  /** Mark a row as successfully cached with its storage details */
  async setCached(
    id: string,
    storageKey: string,
    contentType: string,
    fileSizeBytes: number
  ): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE creative_media_cache
      SET status = 'cached',
          storage_key = ${storageKey},
          content_type = ${contentType},
          file_size_bytes = ${fileSizeBytes},
          cached_at = now(),
          expires_at = now() + interval '7 days',
          error_message = NULL,
          updated_at = now()
      WHERE id = ${id}
    `;
  },

  /** Mark a row as failed, incrementing the retry counter */
  async setFailed(id: string, errorMessage: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE creative_media_cache
      SET status = 'failed',
          error_message = ${errorMessage},
          retry_count = retry_count + 1,
          updated_at = now()
      WHERE id = ${id}
    `;
  },

  /** Find pending or retryable failed rows for the worker to process */
  async findPendingJobs(limit: number): Promise<Row[]> {
    const sql = getDb();
    return (await sql`
      SELECT * FROM creative_media_cache
      WHERE status = 'pending'
         OR (status = 'failed' AND retry_count < 3)
      ORDER BY created_at ASC
      LIMIT ${limit}
    `) as unknown as Row[];
  },

  /** Look up a row by its storage_key (used by the serving endpoint) */
  async findByStorageKey(storageKey: string): Promise<Row | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT * FROM creative_media_cache
      WHERE storage_key = ${storageKey}
      LIMIT 1
    `) as unknown as Row[];
    return rows[0] ?? null;
  },

  /** Delete expired rows. Returns the deleted rows for filesystem cleanup. */
  async deleteExpired(): Promise<Row[]> {
    const sql = getDb();
    return (await sql`
      DELETE FROM creative_media_cache
      WHERE expires_at < now()
      RETURNING *
    `) as unknown as Row[];
  },

  /**
   * Reset rows stuck in 'downloading' for more than 5 minutes
   * back to 'pending' so they can be retried.
   */
  async resetStaleDownloads(): Promise<number> {
    const sql = getDb();
    const rows = await sql`
      UPDATE creative_media_cache
      SET status = 'pending', updated_at = now()
      WHERE status = 'downloading'
        AND updated_at < now() - interval '5 minutes'
      RETURNING id
    `;
    return rows.length;
  },
};
