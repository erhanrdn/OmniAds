import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreativeDecisionOsV2PreviewSurface } from "@/components/creatives/CreativeDecisionOsV2PreviewSurface";
import {
  CREATIVE_DECISION_OS_V2_PREVIEW_CONTRACT_VERSION,
  CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_BUTTON_TEXT,
  CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_INTERNAL_TEXT,
  buildCreativeDecisionOsV2PreviewSurfaceModel,
  type CreativeDecisionOsV2PreviewPayload,
  type CreativeDecisionOsV2PreviewRow,
  type CreativeDecisionOsV2PreviewSourceRow,
} from "@/lib/creative-decision-os-v2-preview";
import liveAudit from "@/docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json";

const sourceRows = liveAudit.rows as CreativeDecisionOsV2PreviewSourceRow[];
const surface = buildCreativeDecisionOsV2PreviewSurfaceModel(sourceRows);
const preview: CreativeDecisionOsV2PreviewPayload = {
  contractVersion: CREATIVE_DECISION_OS_V2_PREVIEW_CONTRACT_VERSION,
  generatedAt: "2026-04-26T12:00:00.000Z",
  sourceDecisionOsGeneratedAt: "2026-04-26T11:00:00.000Z",
  businessId: "sanitized-business",
  rowCount: surface.rows.length,
  surface,
};

function bucket(id: string) {
  const found = surface.buckets.find((item) => item.id === id);
  if (!found) throw new Error(`Missing bucket: ${id}`);
  return found;
}

describe("Creative Decision OS v2 preview surface model", () => {
  it("routes Scale, high-spend Cut, and active Refresh rows into Today Priority", () => {
    const todayPriority = bucket("today_priority");
    const scaleRow = surface.rows.find((row) => row.primaryDecision === "Scale");
    const highSpendCut = surface.rows
      .filter((row) => row.primaryDecision === "Cut")
      .sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0))[0];
    const activeRefresh = surface.rows
      .filter((row) => row.primaryDecision === "Refresh" && row.activeStatus === true)
      .sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0))[0];

    expect(scaleRow).toBeDefined();
    expect(highSpendCut).toBeDefined();
    expect(activeRefresh).toBeDefined();
    expect(todayPriority.rowIds).toContain(scaleRow?.rowId);
    expect(todayPriority.rowIds).toContain(highSpendCut?.rowId);
    expect(todayPriority.rowIds).toContain(activeRefresh?.rowId);
  });

  it("keeps Diagnose and inactive rows collapsed by default", () => {
    expect(bucket("diagnose_first").collapsedByDefault).toBe(true);
    expect(bucket("inactive_review").collapsedByDefault).toBe(true);
    expect(bucket("diagnose_first").rowIds.length).toBeGreaterThan(100);
    expect(bucket("inactive_review").rowIds.length).toBeGreaterThan(0);
  });

  it("sorts buyer urgency above confidence-only direct rows", () => {
    const todayPriorityRows = bucket("today_priority").rowIds
      .map((rowId) => surface.rows.find((row) => row.rowId === rowId))
      .filter((row): row is CreativeDecisionOsV2PreviewRow => Boolean(row));
    const directRows = bucket("ready_for_buyer_confirmation").rowIds
      .map((rowId) => surface.rows.find((row) => row.rowId === rowId))
      .filter((row): row is CreativeDecisionOsV2PreviewRow => Boolean(row));
    const scaleIndex = todayPriorityRows.findIndex((row) => row.primaryDecision === "Scale");
    const cutIndex = todayPriorityRows.findIndex((row) => row.primaryDecision === "Cut");

    expect(directRows.length).toBe(2);
    expect(scaleIndex).toBeGreaterThanOrEqual(0);
    expect(cutIndex).toBeGreaterThanOrEqual(0);
    expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Protect");
    expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Test More");
  });

  it("keeps v2 safety invariants visible in the preview model", () => {
    expect(surface.rows.some((row) => row.primaryDecision === ("Watch" as never))).toBe(false);
    expect(surface.rows.some((row) => row.primaryDecision === ("Scale Review" as never))).toBe(false);
    expect(surface.rows.some((row) => row.queueEligible)).toBe(false);
    expect(surface.rows.some((row) => row.applyEligible)).toBe(false);
    expect(surface.rows.some((row) => row.primaryDecision === "Scale" && row.actionability === "direct")).toBe(false);
    expect(surface.rows.some((row) => row.primaryDecision === "Scale" && row.activeStatus === false)).toBe(false);
  });
});

describe("CreativeDecisionOsV2PreviewSurface", () => {
  it("renders safe read-only text without forbidden button or internal artifact terms", () => {
    const html = renderToStaticMarkup(
      <CreativeDecisionOsV2PreviewSurface preview={preview} onOpenRow={() => undefined} />,
    );

    expect(html).toContain("Today Priority / Buyer Command Strip");
    expect(html).toContain("Ready for Buyer Confirmation");
    expect(html).toContain("Diagnose First");
    expect(html).not.toContain("Watch");
    expect(html).not.toContain("Scale Review");

    const violations = [
      ...CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_BUTTON_TEXT,
      ...CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_INTERNAL_TEXT,
      /labels this row/i,
      /JSON labels/i,
    ].filter((term) => term.test(html));
    expect(violations).toEqual([]);
  });
});
