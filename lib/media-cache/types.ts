/** Cache entry status in the database */
export type CacheStatus = "pending" | "downloading" | "cached" | "failed";

/** A row from the creative_media_cache table */
export interface CreativeMediaCacheRow {
  id: string;
  creative_id: string;
  business_id: string;
  provider: string;
  source_url: string;
  storage_key: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  status: CacheStatus;
  error_message: string | null;
  retry_count: number;
  cached_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/** Payload for a background cache download job */
export interface CacheJobPayload {
  creative_id: string;
  business_id: string;
  provider: string;
  source_url: string;
}

/** Result of resolving a creative's media URL through the cache layer */
export interface CacheResolution {
  /** The URL the frontend should use */
  url: string;
  /** Whether this is a cached internal URL or the original external URL */
  source: "cache" | "origin";
}

/** Provider-agnostic storage interface for cached media files */
export interface MediaStorageAdapter {
  /** Store binary data. Key may contain path separators. */
  write(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Read binary data by key. Returns null if not found. */
  read(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  /** Check if a key exists in storage */
  exists(key: string): Promise<boolean>;
  /** Delete a cached file */
  delete(key: string): Promise<void>;
}
