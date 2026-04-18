function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmpty(values: Array<unknown>) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function resolveCanonicalGoogleAdsProductTitle(input: {
  dimensionProductTitle?: string | null;
  payload?: unknown;
  entityLabel?: string | null;
  entityKey?: string | null;
}) {
  const payload = asObject(input.payload);
  return firstNonEmpty([
    input.dimensionProductTitle,
    payload.productTitle,
    payload.title,
    input.entityLabel,
    input.entityKey,
  ]);
}

export function applyCanonicalGoogleAdsProductFields<T extends Record<string, unknown>>(input: {
  row: T;
  dimensionProductTitle?: string | null;
  payload?: unknown;
  entityLabel?: string | null;
  entityKey?: string | null;
}) {
  const canonicalTitle = resolveCanonicalGoogleAdsProductTitle({
    dimensionProductTitle: input.dimensionProductTitle,
    payload: input.payload,
    entityLabel: input.entityLabel,
    entityKey: input.entityKey,
  });

  return {
    ...input.row,
    name: canonicalTitle,
    productTitle: canonicalTitle,
    title: canonicalTitle,
  };
}
