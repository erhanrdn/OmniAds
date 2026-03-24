export interface MetaCampaignBudgetHistoryEntry {
  campaignId: string;
  eventTime: string;
  oldDailyBudget: number | null;
  newDailyBudget: number | null;
}

interface MetaActivityRecord {
  event_type?: string;
  event_time?: string;
  extra_data?: string;
  object_id?: string;
  object_type?: string;
}

interface MetaGraphCollectionResponse<TItem> {
  data?: TItem[];
  paging?: {
    next?: string;
  };
}

interface MetaBudgetValue {
  type?: string;
  currency?: string;
  old_value?: number | null;
  new_value?: number | null;
  additional_type?: string;
  additional_value?: string;
}

interface MetaCompositeBudgetData {
  old_value?: MetaBudgetValue | null;
  new_value?: MetaBudgetValue | null;
  type?: string;
}

function parseBudgetValue(value: MetaBudgetValue | null | undefined, key: "old_value" | "new_value") {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function parseCompositeBudgetData(raw: string | null | undefined): MetaCompositeBudgetData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MetaCompositeBudgetData;
  } catch {
    return null;
  }
}

async function fetchPagedActivities(initialUrl: string): Promise<MetaActivityRecord[]> {
  const rows: MetaActivityRecord[] = [];
  let nextUrl: string | null = initialUrl;
  let pageCount = 0;

  while (nextUrl && pageCount < 40) {
    const res = await fetch(nextUrl, { cache: "no-store" });
    if (!res.ok) break;
    const json = (await res.json()) as MetaGraphCollectionResponse<MetaActivityRecord>;
    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
    pageCount += 1;
  }

  return rows;
}

export async function fetchPreviousCampaignBudgetsFromHistory(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  currentDailyBudgetsByCampaign: Map<string, number>;
  maxPages?: number;
}): Promise<Map<string, { previousDailyBudget: number | null; capturedAt: string | null }>> {
  const unresolved = new Map(
    Array.from(input.currentDailyBudgetsByCampaign.entries()).filter(
      ([campaignId, budget]) => Boolean(campaignId) && typeof budget === "number" && Number.isFinite(budget)
    )
  );

  if (unresolved.size === 0) return new Map();

  const result = new Map<string, { previousDailyBudget: number | null; capturedAt: string | null }>();
  const url = new URL(`https://graph.facebook.com/v25.0/${input.accountId}/activities`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("since", input.since);
  url.searchParams.set("until", input.until);
  url.searchParams.set(
    "fields",
    "event_type,event_time,extra_data,object_id,object_type"
  );
  url.searchParams.set("access_token", input.accessToken);

  let nextUrl: string | null = url.toString();
  let pageCount = 0;
  const maxPages = Math.max(1, input.maxPages ?? 8);

  while (nextUrl && pageCount < maxPages && unresolved.size > 0) {
    const res = await fetch(nextUrl, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) break;

    const json = (await res.json()) as MetaGraphCollectionResponse<MetaActivityRecord>;
    for (const row of json.data ?? []) {
      if (row.event_type !== "update_campaign_budget") continue;

      const campaignId = row.object_id ?? "";
      const currentDailyBudget = unresolved.get(campaignId);
      if (typeof currentDailyBudget !== "number") continue;

      const data = parseCompositeBudgetData(row.extra_data);
      const oldDailyBudget = parseBudgetValue(data?.old_value, "old_value");
      const newDailyBudget = parseBudgetValue(data?.new_value, "new_value");

      if (oldDailyBudget == null || newDailyBudget == null) continue;
      if (newDailyBudget !== currentDailyBudget) continue;

      result.set(campaignId, {
        previousDailyBudget: oldDailyBudget,
        capturedAt: row.event_time ?? null,
      });
      unresolved.delete(campaignId);
    }

    nextUrl = json.paging?.next ?? null;
    pageCount += 1;
  }

  return result;
}

export async function fetchCampaignBudgetHistory(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  campaignIds: string[];
}): Promise<Map<string, MetaCampaignBudgetHistoryEntry[]>> {
  const campaignIds = new Set(input.campaignIds.filter(Boolean));
  if (campaignIds.size === 0) return new Map();

  const url = new URL(`https://graph.facebook.com/v25.0/${input.accountId}/activities`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("since", input.since);
  url.searchParams.set("until", input.until);
  url.searchParams.set(
    "fields",
    "event_type,event_time,extra_data,object_id,object_type"
  );
  url.searchParams.set("access_token", input.accessToken);

  const rows = await fetchPagedActivities(url.toString());
  const result = new Map<string, MetaCampaignBudgetHistoryEntry[]>();

  for (const row of rows) {
    if (row.event_type !== "update_campaign_budget") continue;
    const campaignId = row.object_id ?? "";
    if (!campaignIds.has(campaignId)) continue;

    const data = parseCompositeBudgetData(row.extra_data);
    const oldDailyBudget = parseBudgetValue(data?.old_value, "old_value");
    const newDailyBudget = parseBudgetValue(data?.new_value, "new_value");
    if (oldDailyBudget == null && newDailyBudget == null) continue;

    const existing = result.get(campaignId) ?? [];
    existing.push({
      campaignId,
      eventTime: row.event_time ?? "",
      oldDailyBudget,
      newDailyBudget,
    });
    result.set(campaignId, existing);
  }

  return result;
}

export function findPreviousDifferentBudgetFromHistory(input: {
  currentDailyBudget: number | null;
  history: MetaCampaignBudgetHistoryEntry[];
}): { previousDailyBudget: number | null; capturedAt: string | null } {
  if (input.currentDailyBudget == null) {
    return { previousDailyBudget: null, capturedAt: null };
  }

  for (const entry of input.history) {
    if (entry.newDailyBudget === input.currentDailyBudget && entry.oldDailyBudget != null) {
      return {
        previousDailyBudget: entry.oldDailyBudget,
        capturedAt: entry.eventTime || null,
      };
    }
  }

  return { previousDailyBudget: null, capturedAt: null };
}
