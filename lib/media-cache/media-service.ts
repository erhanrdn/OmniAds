import type { CacheResolution } from "./types";
import { CacheRepository } from "./cache-repository";
import { getWorker } from "./thumbnail-cache-worker";

interface CreativeMediaInput {
  creative_id: string;
  thumbnail_url: string | null;
  image_url: string | null;
}

/**
 * Orchestrator for the creative media cache.
 *
 * Called from the creatives API route to resolve cached URLs
 * and enqueue downloads for uncached creatives.
 */
export const MediaCacheService = {
  /**
   * Resolve cached URLs for a batch of creatives.
   * Returns a map of creative_id → CacheResolution.
   *
   * - If cached & valid: returns internal `/api/media/cache/...` URL
   * - If not cached: enqueues background download, returns original Meta URL
   */
  async resolveUrls(
    items: CreativeMediaInput[],
    businessId: string,
    provider = "meta"
  ): Promise<Map<string, CacheResolution>> {
    const result = new Map<string, CacheResolution>();
    if (items.length === 0) return result;

    // 1. Batch-query for existing cache entries
    const creativeIds = items.map((item) => item.creative_id);
    const cached = await CacheRepository.findCachedByCreativeIds(
      creativeIds,
      businessId,
      provider
    );

    const worker = getWorker();

    // 2. Resolve each creative
    for (const item of items) {
      const cacheRow = cached.get(item.creative_id);

      if (cacheRow?.storage_key) {
        // Cache hit — return internal URL
        result.set(item.creative_id, {
          url: `/api/media/cache/${cacheRow.storage_key}`,
          source: "cache",
        });
        continue;
      }

      // Pick best available source URL
      const sourceUrl = item.thumbnail_url ?? item.image_url;

      if (sourceUrl) {
        // Enqueue for background download
        worker.enqueue({
          creative_id: item.creative_id,
          business_id: businessId,
          provider,
          source_url: sourceUrl,
        });

        // Return the original URL for now
        result.set(item.creative_id, {
          url: sourceUrl,
          source: "origin",
        });
      }
    }

    return result;
  },

  /**
   * Run maintenance: expire old entries, reset stale downloads, cleanup files.
   * Call this from a cron job or periodically from the API.
   */
  async cleanup(): Promise<{ expired: number; resetStale: number }> {
    const expired = await CacheRepository.deleteExpired();
    const resetStale = await CacheRepository.resetStaleDownloads();

    // Clean up files for expired entries
    if (expired.length > 0) {
      const { LocalStorageAdapter } = await import("./storage-adapter");
      const adapter = new LocalStorageAdapter();
      await Promise.allSettled(
        expired
          .filter((row) => row.storage_key)
          .map((row) => adapter.delete(row.storage_key!))
      );
    }

    return { expired: expired.length, resetStale };
  },
};
