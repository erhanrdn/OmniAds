import type {
  AiTagKey,
  CopyExtraction,
  CopySourceLabel,
  CreativeDebugInfo,
  CreativeType,
  MetaAdRecord,
  MetaAiTags,
  RawCreativeRow,
  StoryCopyPayload,
} from "@/lib/meta/creatives-types";
import { getLegacyCreativeTypeLabel } from "@/lib/meta/creative-taxonomy";

export function normalizeCopyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  if (normalized.length < 2) return null;
  return normalized;
}

export function uniqueNormalizedText(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeCopyText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

type CopyLike = {
  copy_text?: unknown;
  copy_variants?: Array<unknown>;
  headline_variants?: Array<unknown>;
  description_variants?: Array<unknown>;
};

export function hasCopyContent(row: CopyLike): boolean {
  return Boolean(
    normalizeCopyText(row.copy_text) ||
      uniqueNormalizedText(row.copy_variants ?? []).length > 0 ||
      uniqueNormalizedText(row.headline_variants ?? []).length > 0 ||
      uniqueNormalizedText(row.description_variants ?? []).length > 0
  );
}

export function hasSuspiciousCopyEmptyRows(rows: CopyLike[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => !hasCopyContent(row));
}

export function chooseBestCopyText(extraction: Pick<CopyExtraction, "copy_variants" | "headline_variants" | "description_variants">) {
  if (extraction.copy_variants.length > 0) return extraction.copy_variants[0];
  if (extraction.headline_variants.length > 0) return extraction.headline_variants[0];
  if (extraction.description_variants.length > 0) return extraction.description_variants[0];
  return null;
}

export function resolveCreativeCopyExtraction(creative: MetaAdRecord["creative"]): CopyExtraction {
  if (!creative) {
    return {
      copy_text: null,
      copy_variants: [],
      headline_variants: [],
      description_variants: [],
      copy_source: null,
    };
  }

  const assetFeedBodies = uniqueNormalizedText((creative.asset_feed_spec?.bodies ?? []).map((item) => item?.text));
  const assetFeedTitles = uniqueNormalizedText((creative.asset_feed_spec?.titles ?? []).map((item) => item?.text));
  const assetFeedDescriptions = uniqueNormalizedText((creative.asset_feed_spec?.descriptions ?? []).map((item) => item?.text));

  const objectMessages = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.message,
    creative.object_story_spec?.video_data?.message,
    creative.object_story_spec?.photo_data?.message,
  ]);
  const objectHeadlines = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.name,
    creative.object_story_spec?.video_data?.title,
  ]);
  const objectDescriptions = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.description,
    creative.object_story_spec?.photo_data?.caption,
  ]);

  const directBodies = uniqueNormalizedText([creative.body, creative.text, creative.message]);
  const directHeadlines = uniqueNormalizedText([creative.title]);
  const directDescriptions = uniqueNormalizedText([creative.description]);

  const copyVariants = uniqueNormalizedText([
    ...assetFeedBodies,
    ...objectMessages,
    ...directBodies,
  ]);
  const headlineVariants = uniqueNormalizedText([
    ...assetFeedTitles,
    ...objectHeadlines,
    ...directHeadlines,
  ]);
  const descriptionVariants = uniqueNormalizedText([
    ...assetFeedDescriptions,
    ...objectDescriptions,
    ...directDescriptions,
  ]);

  const copyText = chooseBestCopyText({
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
  });

  let copySource: CopySourceLabel | null = null;
  if (copyText) {
    if (assetFeedBodies.includes(copyText)) copySource = "asset_feed_spec.bodies";
    else if (objectMessages.includes(copyText)) copySource = "object_story_spec.message";
    else if (directBodies.includes(copyText)) copySource = "creative.body";
    else if (assetFeedTitles.includes(copyText)) copySource = "asset_feed_spec.titles";
    else if (objectHeadlines.includes(copyText)) copySource = "object_story_spec.name";
    else if (directHeadlines.includes(copyText)) copySource = "creative.title";
    else if (assetFeedDescriptions.includes(copyText)) copySource = "asset_feed_spec.descriptions";
    else if (objectDescriptions.includes(copyText)) copySource = "object_story_spec.description";
    else if (directDescriptions.includes(copyText)) copySource = "creative.description";
  }

  return {
    copy_text: copyText,
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
    copy_source: copySource,
  };
}

export const AI_TAG_LABEL_TO_KEY: Record<string, AiTagKey> = {
  "asset type": "assetType",
  "visual format": "visualFormat",
  "intended audience": "intendedAudience",
  "messaging angle": "messagingAngle",
  seasonality: "seasonality",
  "offer type": "offerType",
  "hook tactic": "hookTactic",
  "headline tactic": "headlineTactic",
};

export function normalizeAiTags(rawTags: string[] | undefined): MetaAiTags {
  if (!Array.isArray(rawTags) || rawTags.length === 0) return {};

  const next: MetaAiTags = {};
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") continue;
    const trimmed = rawTag.trim();
    if (!trimmed) continue;

    const separator = trimmed.includes(":") ? ":" : trimmed.includes("=") ? "=" : null;
    if (!separator) continue;
    const [rawLabel, rawValue] = trimmed.split(separator, 2);
    const key = AI_TAG_LABEL_TO_KEY[rawLabel.trim().toLowerCase()];
    const value = rawValue?.trim();
    if (!key || !value) continue;
    const existing = next[key] ?? [];
    if (!existing.includes(value)) existing.push(value);
    next[key] = existing;
  }

  return next;
}

export const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  feed: getLegacyCreativeTypeLabel("feed"),
  video: getLegacyCreativeTypeLabel("video"),
  flexible: getLegacyCreativeTypeLabel("flexible"),
  feed_catalog: getLegacyCreativeTypeLabel("feed_catalog"),
};

export function toCreativeTypeLabel(type: CreativeType): string {
  return CREATIVE_TYPE_LABELS[type] ?? getLegacyCreativeTypeLabel("feed");
}

export function resolveGroupedCreativeType(rows: RawCreativeRow[]): CreativeType {
  if (rows.some((row) => row.creative_type === "feed_catalog")) return "feed_catalog";
  if (rows.some((row) => row.creative_type === "flexible")) return "flexible";
  if (rows.some((row) => row.creative_type === "video")) return "video";
  return "feed";
}

export function mergeExtraction(base: CopyExtraction, partial: {
  copy_variants?: string[];
  headline_variants?: string[];
  description_variants?: string[];
  source?: CopySourceLabel;
}): CopyExtraction {
  const mergedCopyVariants = uniqueNormalizedText([...(base.copy_variants ?? []), ...(partial.copy_variants ?? [])]);
  const mergedHeadlineVariants = uniqueNormalizedText([...(base.headline_variants ?? []), ...(partial.headline_variants ?? [])]);
  const mergedDescriptionVariants = uniqueNormalizedText([
    ...(base.description_variants ?? []),
    ...(partial.description_variants ?? []),
  ]);
  const addedContent =
    mergedCopyVariants.length > (base.copy_variants?.length ?? 0) ||
    mergedHeadlineVariants.length > (base.headline_variants?.length ?? 0) ||
    mergedDescriptionVariants.length > (base.description_variants?.length ?? 0);
  const mergedText =
    chooseBestCopyText({
      copy_variants: mergedCopyVariants,
      headline_variants: mergedHeadlineVariants,
      description_variants: mergedDescriptionVariants,
    }) ?? null;
  return {
    copy_text: mergedText,
    copy_variants: mergedCopyVariants,
    headline_variants: mergedHeadlineVariants,
    description_variants: mergedDescriptionVariants,
    copy_source: base.copy_source ?? (addedContent ? partial.source ?? null : null),
  };
}

export function mergeDebugSources(base: string[] | undefined, incoming: string[] | undefined): string[] {
  const merged = new Set<string>([...(base ?? []), ...(incoming ?? [])]);
  return Array.from(merged);
}

export function applyExtractionToRow(
  row: RawCreativeRow,
  extraction: CopyExtraction,
  debugSource: string,
  unresolvedReason: string | null = null
): RawCreativeRow {
  const merged = mergeExtraction(
    {
      copy_text: row.copy_text ?? null,
      copy_variants: row.copy_variants ?? [],
      headline_variants: row.headline_variants ?? [],
      description_variants: row.description_variants ?? [],
      copy_source: row.copy_source ?? null,
    },
    {
      copy_variants: extraction.copy_variants,
      headline_variants: extraction.headline_variants,
      description_variants: extraction.description_variants,
      source: extraction.copy_source ?? undefined,
    }
  );
  const hasRecoveredCopy = Boolean(
    hasCopyContent(merged)
  );
  return {
    ...row,
    ...merged,
    copy_debug_sources: mergeDebugSources(row.copy_debug_sources, [debugSource]),
    unresolved_reason: hasRecoveredCopy ? null : unresolvedReason ?? row.unresolved_reason ?? null,
  };
}

export function extractVariantsFromPreviewHtml(html: string): {
  copy_variants: string[];
  headline_variants: string[];
  description_variants: string[];
} {
  const collectQuotedValues = (keys: string[]): string[] => {
    const values: string[] = [];
    for (const key of keys) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
      let match: RegExpExecArray | null = re.exec(html);
      while (match) {
        const candidate = match[1];
        try {
          const decoded = JSON.parse(`"${candidate}"`);
          const normalized = normalizeCopyText(decoded);
          if (normalized) values.push(normalized);
        } catch {
          const normalized = normalizeCopyText(candidate);
          if (normalized) values.push(normalized);
        }
        match = re.exec(html);
      }
    }
    return uniqueNormalizedText(values);
  };

  return {
    copy_variants: collectQuotedValues(["message", "primary_text", "body", "text", "caption"]),
    headline_variants: collectQuotedValues(["headline", "title", "name"]),
    description_variants: collectQuotedValues(["description"]),
  };
}

export async function fetchStoryCopyMap(
  storyIds: string[],
  accessToken: string
): Promise<Map<string, StoryCopyPayload>> {
  const map = new Map<string, StoryCopyPayload>();
  const ids = Array.from(new Set(storyIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", "message,name,description,story,attachments{title,description}");
    url.searchParams.set("access_token", accessToken);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const payload = (await res.json().catch(() => null)) as Record<string, Record<string, unknown>> | null;
      if (!payload || typeof payload !== "object") continue;
      for (const [id, value] of Object.entries(payload)) {
        const attachmentData = Array.isArray((value?.attachments as { data?: unknown[] } | undefined)?.data)
          ? (((value?.attachments as { data?: unknown[] }).data as unknown[]) ?? [])
          : [];
        const attachmentTitles = attachmentData
          .map((item) =>
            item && typeof item === "object" && "title" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).title
              : null
          );
        const attachmentDescriptions = attachmentData
          .map((item) =>
            item && typeof item === "object" && "description" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).description
              : null
          );
        const message = uniqueNormalizedText([value?.message, value?.story]);
        const headline = uniqueNormalizedText([value?.name, ...attachmentTitles]);
        const description = uniqueNormalizedText([value?.description, ...attachmentDescriptions]);
        if (message.length === 0 && headline.length === 0 && description.length === 0) continue;
        map.set(id, { message, headline, description });
      }
    } catch {
      // Story lookup is best-effort fallback.
    }
  }
  return map;
}

export function buildCreativeDebugInfo(input: {
  debug_stage_fetch_source?: string | null;
  debug_stage_has_raw_ad?: boolean;
  debug_stage_raw_ad_id?: string | null;
  debug_stage_raw_ad_creative?: boolean;
  debug_stage_raw_ad_creative_thumbnail_url?: string | null;
  debug_stage_enriched_ad_creative?: boolean;
  debug_stage_enriched_ad_creative_thumbnail_url?: string | null;
  debug_stage_row_input_thumbnail_url?: string | null;
  debug_stage_final_thumbnail_url?: string | null;
  debug_stage_null_reason?: string | null;
  debug_raw_creative_thumbnail_url?: string | null;
  debug_enriched_creative_thumbnail_url?: string | null;
  debug_resolved_thumbnail_source?: string | null;
  debug_resolution_stage?: string | null;
  debug_creative_object_type?: string | null;
  debug_creative_video_ids?: string[] | null;
  debug_creative_effective_object_story_id?: string | null;
  debug_creative_object_story_id?: string | null;
  debug_creative_object_story_video_id?: string | null;
  debug_creative_asset_video_ids?: string[] | null;
}): CreativeDebugInfo {
  return {
    stage_fetch_source: input.debug_stage_fetch_source ?? null,
    stage_has_raw_ad: input.debug_stage_has_raw_ad ?? false,
    stage_raw_ad_id: input.debug_stage_raw_ad_id ?? null,
    stage_raw_ad_creative: input.debug_stage_raw_ad_creative ?? false,
    stage_raw_ad_creative_thumbnail_url: input.debug_stage_raw_ad_creative_thumbnail_url ?? null,
    stage_enriched_ad_creative: input.debug_stage_enriched_ad_creative ?? false,
    stage_enriched_ad_creative_thumbnail_url: input.debug_stage_enriched_ad_creative_thumbnail_url ?? null,
    stage_row_input_thumbnail_url: input.debug_stage_row_input_thumbnail_url ?? null,
    stage_final_thumbnail_url: input.debug_stage_final_thumbnail_url ?? null,
    stage_null_reason: input.debug_stage_null_reason ?? null,
    raw_creative_thumbnail_url: input.debug_raw_creative_thumbnail_url ?? null,
    enriched_creative_thumbnail_url: input.debug_enriched_creative_thumbnail_url ?? null,
    resolved_thumbnail_source: input.debug_resolved_thumbnail_source ?? null,
    resolution_stage: input.debug_resolution_stage ?? null,
    creative_object_type: input.debug_creative_object_type ?? null,
    creative_video_ids: input.debug_creative_video_ids ?? null,
    creative_effective_object_story_id: input.debug_creative_effective_object_story_id ?? null,
    creative_object_story_id: input.debug_creative_object_story_id ?? null,
    creative_object_story_video_id: input.debug_creative_object_story_video_id ?? null,
    creative_asset_video_ids: input.debug_creative_asset_video_ids ?? null,
  };
}
