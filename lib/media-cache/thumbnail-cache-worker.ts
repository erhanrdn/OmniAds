import type { CacheJobPayload, MediaStorageAdapter } from "./types";
import { CacheRepository } from "./cache-repository";
import { LocalStorageAdapter } from "./storage-adapter";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_CONCURRENCY = 3;
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * In-process background worker that downloads creative thumbnails
 * and stores them via the storage adapter.
 *
 * Designed for idempotency and crash-safety:
 * - Duplicate jobs are deduplicated by Map key
 * - DB-level status guards prevent double-processing across requests
 * - Stale "downloading" rows are auto-reset by resetStaleDownloads()
 */
class ThumbnailCacheWorker {
  private queue = new Map<string, CacheJobPayload>();
  private draining = false;
  private adapter: MediaStorageAdapter;

  constructor(adapter: MediaStorageAdapter) {
    this.adapter = adapter;
  }

  /** Add a job to the queue (deduplicated by creative key) */
  enqueue(job: CacheJobPayload): void {
    const key = `${job.provider}:${job.business_id}:${job.creative_id}`;
    if (this.queue.has(key)) return;
    this.queue.set(key, job);
    if (!this.draining) {
      this.draining = true;
      // Use setImmediate/setTimeout to allow the API response to return first
      setTimeout(() => this.drain(), 0);
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.size > 0) {
        const batch: CacheJobPayload[] = [];
        for (const [key, job] of this.queue) {
          batch.push(job);
          this.queue.delete(key);
          if (batch.length >= MAX_CONCURRENCY) break;
        }
        await Promise.allSettled(batch.map((job) => this.processJob(job)));
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[media-cache-worker] drain error", err);
      }
    } finally {
      this.draining = false;
    }
  }

  private async processJob(job: CacheJobPayload): Promise<void> {
    const { creative_id, business_id, provider, source_url } = job;

    // 1. Upsert a pending row (idempotent — skips if already cached or downloading)
    const row = await CacheRepository.upsertPending(
      creative_id,
      business_id,
      provider,
      source_url
    );
    if (!row) return; // already cached or in-flight

    // 2. Transition to downloading (atomic guard against double-processing)
    const claimed = await CacheRepository.setDownloading(row.id);
    if (!claimed) return;

    try {
      // 3. Download the image from the source URL
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        DOWNLOAD_TIMEOUT_MS
      );

      const response = await fetch(source_url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
      });
      clearTimeout(timeout);

      if (!response.ok || !response.body) {
        throw new Error(
          `Upstream returned ${response.status} ${response.statusText}`
        );
      }

      const contentType =
        response.headers.get("content-type")?.split(";")[0].trim() ??
        "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0) {
        throw new Error("Empty response body");
      }

      // 4. Derive storage key and persist
      const ext = CONTENT_TYPE_TO_EXT[contentType] ?? "jpg";
      const storageKey = `${provider}/${business_id}/${creative_id}.${ext}`;

      await this.adapter.write(storageKey, buffer, contentType);

      // 5. Mark as cached in DB
      await CacheRepository.setCached(
        row.id,
        storageKey,
        contentType,
        buffer.length
      );

      if (process.env.NODE_ENV !== "production") {
        console.log("[media-cache-worker] cached", {
          creative_id,
          storageKey,
          size: buffer.length,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await CacheRepository.setFailed(row.id, message);

      if (process.env.NODE_ENV !== "production") {
        console.warn("[media-cache-worker] failed", {
          creative_id,
          source_url: source_url.slice(0, 80),
          error: message,
        });
      }
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────
let instance: ThumbnailCacheWorker | null = null;

export function getWorker(): ThumbnailCacheWorker {
  if (!instance) {
    instance = new ThumbnailCacheWorker(new LocalStorageAdapter());
  }
  return instance;
}
