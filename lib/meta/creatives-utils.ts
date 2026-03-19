import type { MetaAdRecord } from "@/lib/meta/creatives-types";

export function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function extractPostIdFromStoryIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Common Meta object_story_id format: <actor_id>_<post_id>
  const underscoreMatch = trimmed.match(/^\d+_(\d+)$/);
  if (underscoreMatch?.[1]) return underscoreMatch[1];

  // Already a direct post id.
  const directMatch = trimmed.match(/^\d{6,}$/);
  if (directMatch) return directMatch[0];

  // Last resort: pick long numeric token if clearly present.
  const tokens = trimmed.match(/\d{6,}/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens[tokens.length - 1] ?? null;
}

export function extractVideoIdsFromCreative(
  creative: MetaAdRecord["creative"] | null | undefined
): string[] {
  if (!creative) return [];
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    ids.add(trimmed);
  };

  add(creative.video_id);
  add(creative.object_story_spec?.video_data?.video_id);
  for (const video of creative.asset_feed_spec?.videos ?? []) {
    add(video?.video_id);
  }
  return Array.from(ids);
}
