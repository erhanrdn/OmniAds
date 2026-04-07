export const META_CANONICAL_METRIC_SCHEMA_VERSION = 2;

export const META_CANONICAL_CLICK_SEMANTICS = "clicks_all_v2" as const;

export function assertMetaCanonicalClicksSource(input: {
  targetField: string;
  sourceField: string;
}) {
  if (input.targetField === "clicks" && input.sourceField === "link_clicks") {
    throw new Error("meta_canonical_clicks_must_not_map_from_link_clicks");
  }
}
