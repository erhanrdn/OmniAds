import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import {
  normalizeTargetRoasValue,
  type MetaConfigSnapshotPayload,
} from "@/lib/meta/configuration";

export type MetaConfigEntityLevel = "campaign" | "adset";

interface MetaConfigSnapshotInsert {
  businessId: string;
  accountId: string;
  entityLevel: MetaConfigEntityLevel;
  entityId: string;
  payload: MetaConfigSnapshotPayload;
}

export interface MetaPreviousConfigDiff {
  previousManualBidAmount: number | null;
  previousBidValue: number | null;
  previousBidValueFormat: "currency" | "roas" | null;
  previousBidCapturedAt: string | null;
  previousDailyBudget: number | null;
  previousLifetimeBudget: number | null;
  previousBudgetCapturedAt: string | null;
}

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeForJson(entry),
      ])
    );
  }
  return String(value);
}

export async function readLatestMetaConfigSnapshots(input: {
  businessId: string;
  entityLevel: MetaConfigEntityLevel;
  entityIds: string[];
}): Promise<Map<string, MetaConfigSnapshotPayload>> {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map();

  try {
    await runMigrations();
    const sql = getDb();
    const rows = (await sql`
      WITH ranked AS (
        SELECT
          entity_id,
          payload,
          ROW_NUMBER() OVER (
            PARTITION BY entity_id
            ORDER BY captured_at DESC
          ) AS row_num
        FROM meta_config_snapshots
        WHERE business_id = ${input.businessId}
          AND entity_level = ${input.entityLevel}
          AND entity_id = ANY(${entityIds}::text[])
      )
      SELECT entity_id, payload
      FROM ranked
      WHERE row_num = 1
    `) as unknown as Array<{ entity_id: string; payload: MetaConfigSnapshotPayload }>;

    return new Map(rows.map((row) => [row.entity_id, row.payload]));
  } catch (error) {
    console.warn("[meta-config-snapshots] read_latest_failed", {
      businessId: input.businessId,
      entityLevel: input.entityLevel,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

export async function readPreviousMetaConfigSnapshots(input: {
  businessId: string;
  entityLevel: MetaConfigEntityLevel;
  entityIds: string[];
}): Promise<Map<string, MetaConfigSnapshotPayload>> {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map();

  try {
    await runMigrations();
    const sql = getDb();
    const rows = (await sql`
      WITH informative AS (
        SELECT
          entity_id,
          payload,
          ROW_NUMBER() OVER (
            PARTITION BY entity_id
            ORDER BY captured_at DESC
          ) AS row_num
        FROM meta_config_snapshots
        WHERE business_id = ${input.businessId}
          AND entity_level = ${input.entityLevel}
          AND entity_id = ANY(${entityIds}::text[])
          AND (
            payload->>'bidValue' IS NOT NULL
            OR payload->>'manualBidAmount' IS NOT NULL
            OR payload->>'bidStrategyLabel' IS NOT NULL
          )
      )
      SELECT entity_id, payload
      FROM informative
      WHERE row_num = 2
    `) as unknown as Array<{ entity_id: string; payload: MetaConfigSnapshotPayload }>;

    return new Map(rows.map((row) => [row.entity_id, row.payload]));
  } catch (error) {
    console.warn("[meta-config-snapshots] read_previous_failed", {
      businessId: input.businessId,
      entityLevel: input.entityLevel,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

function valuesEqual(left: number | string | null | undefined, right: number | string | null | undefined) {
  return (left ?? null) === (right ?? null);
}

function normalizeLegacySnapshotPayload(payload: MetaConfigSnapshotPayload): MetaConfigSnapshotPayload {
  if (payload.bidValueFormat !== "roas") return payload;
  return {
    ...payload,
    bidValue: normalizeTargetRoasValue(payload.bidValue),
  };
}

function isInformativePayload(payload: MetaConfigSnapshotPayload) {
  return (
    payload.bidValue != null ||
    payload.manualBidAmount != null ||
    payload.bidStrategyLabel != null ||
    payload.dailyBudget != null ||
    payload.lifetimeBudget != null
  );
}

export async function readPreviousDifferentMetaConfigDiffs(input: {
  businessId: string;
  entityLevel: MetaConfigEntityLevel;
  entityIds: string[];
}): Promise<Map<string, MetaPreviousConfigDiff>> {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map();

  try {
    await runMigrations();
    const sql = getDb();
    const rows = (await sql`
      SELECT entity_id, captured_at, payload
      FROM meta_config_snapshots
      WHERE business_id = ${input.businessId}
        AND entity_level = ${input.entityLevel}
        AND entity_id = ANY(${entityIds}::text[])
      ORDER BY entity_id ASC, captured_at DESC
    `) as unknown as Array<{
      entity_id: string;
      captured_at: string;
      payload: MetaConfigSnapshotPayload;
    }>;

    const byEntity = new Map<string, Array<{ capturedAt: string; payload: MetaConfigSnapshotPayload }>>();
    for (const row of rows) {
      const payload = normalizeLegacySnapshotPayload(row.payload);
      if (!isInformativePayload(payload)) continue;
      const existing = byEntity.get(row.entity_id) ?? [];
      existing.push({
        capturedAt: row.captured_at,
        payload,
      });
      byEntity.set(row.entity_id, existing);
    }

    const result = new Map<string, MetaPreviousConfigDiff>();

    for (const entityId of entityIds) {
      const history = byEntity.get(entityId) ?? [];
      const current = history[0]?.payload;
      if (!current) continue;

      let previousBid: { payload: MetaConfigSnapshotPayload; capturedAt: string } | null = null;
      let previousBudget: { payload: MetaConfigSnapshotPayload; capturedAt: string } | null = null;

      for (const row of history.slice(1)) {
        if (
          previousBid == null &&
          (
            !valuesEqual(row.payload.bidValue, current.bidValue) ||
            !valuesEqual(row.payload.bidValueFormat, current.bidValueFormat) ||
            !valuesEqual(row.payload.manualBidAmount, current.manualBidAmount)
          )
        ) {
          previousBid = row;
        }

        if (
          previousBudget == null &&
          (
            !valuesEqual(row.payload.dailyBudget, current.dailyBudget) ||
            !valuesEqual(row.payload.lifetimeBudget, current.lifetimeBudget)
          )
        ) {
          previousBudget = row;
        }

        if (previousBid && previousBudget) break;
      }

      result.set(entityId, {
        previousManualBidAmount: previousBid?.payload.manualBidAmount ?? null,
        previousBidValue: previousBid?.payload.bidValue ?? null,
        previousBidValueFormat: previousBid?.payload.bidValueFormat ?? null,
        previousBidCapturedAt: previousBid?.capturedAt ?? null,
        previousDailyBudget: previousBudget?.payload.dailyBudget ?? null,
        previousLifetimeBudget: previousBudget?.payload.lifetimeBudget ?? null,
        previousBudgetCapturedAt: previousBudget?.capturedAt ?? null,
      });
    }

    return result;
  } catch (error) {
    console.warn("[meta-config-snapshots] read_previous_different_failed", {
      businessId: input.businessId,
      entityLevel: input.entityLevel,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

export async function appendMetaConfigSnapshots(
  rows: MetaConfigSnapshotInsert[]
): Promise<void> {
  if (rows.length === 0) return;

  try {
    await runMigrations();
    const sql = getDb();
    const payload = JSON.stringify(
      rows.map((row) => ({
        business_id: row.businessId,
        account_id: row.accountId,
        entity_level: row.entityLevel,
        entity_id: row.entityId,
        payload: sanitizeForJson(row.payload),
      }))
    );

    await sql`
      INSERT INTO meta_config_snapshots (
        business_id,
        account_id,
        entity_level,
        entity_id,
        payload
      )
      SELECT
        item.business_id,
        item.account_id,
        item.entity_level,
        item.entity_id,
        item.payload
      FROM jsonb_to_recordset(${payload}::jsonb) AS item(
        business_id text,
        account_id text,
        entity_level text,
        entity_id text,
        payload jsonb
      )
    `;
  } catch (error) {
    console.warn("[meta-config-snapshots] append_failed", {
      rowCount: rows.length,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
