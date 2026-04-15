export interface SyncLagMetrics {
  stageStartedAt: string | null;
  publishStartedAt: string | null;
  publishedAt: string | null;
  orchestrationLagMs: number | null;
  publishLatencyMs: number | null;
  endToEndLagMs: number | null;
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function diffMs(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, endMs - startMs);
}

export function buildSyncLagMetrics(input: {
  stageStartedAt?: string | null;
  publishStartedAt?: string | null;
  publishedAt?: string | null;
} | null | undefined) : SyncLagMetrics | null {
  if (!input) return null;
  const stageStartedAt = normalizeTimestamp(input.stageStartedAt ?? null);
  const publishStartedAt = normalizeTimestamp(input.publishStartedAt ?? null);
  const publishedAt = normalizeTimestamp(input.publishedAt ?? null);
  if (!stageStartedAt && !publishStartedAt && !publishedAt) {
    return null;
  }
  return {
    stageStartedAt,
    publishStartedAt,
    publishedAt,
    orchestrationLagMs: diffMs(stageStartedAt, publishStartedAt),
    publishLatencyMs: diffMs(publishStartedAt, publishedAt),
    endToEndLagMs: diffMs(stageStartedAt, publishedAt),
  };
}
