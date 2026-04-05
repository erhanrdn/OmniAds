import { describe, expect, it } from "vitest";
import {
  META_PAGE_NON_BLOCKING_SURFACES,
  META_PAGE_OPTIONAL_SURFACES,
  META_PAGE_PAGE_SCOPED_SURFACES,
  META_PAGE_PROVIDER_SCOPED_SURFACES,
  META_PAGE_REQUIRED_SURFACES,
  META_PAGE_REQUIRED_SURFACE_ORDER,
  META_PAGE_TRUTH_CLASSES,
} from "@/lib/meta/page-contract";
import { getMetaRequiredPageSurfaceKeys } from "@/lib/meta/page-readiness";

describe("meta page contract", () => {
  it("keeps required surface order explicit and deterministic", () => {
    expect(META_PAGE_REQUIRED_SURFACE_ORDER).toEqual([
      "summary",
      "campaigns",
      "breakdowns.age",
      "breakdowns.location",
      "breakdowns.placement",
    ]);
    expect(META_PAGE_REQUIRED_SURFACES).toEqual(META_PAGE_REQUIRED_SURFACE_ORDER);
  });

  it("keeps optional and non-blocking surfaces explicit", () => {
    expect(META_PAGE_OPTIONAL_SURFACES).toEqual([
      "adsets",
      "recommendations",
    ]);
    expect(META_PAGE_NON_BLOCKING_SURFACES).toEqual(META_PAGE_OPTIONAL_SURFACES);
  });

  it("keeps provider-scoped and page-scoped surfaces separate", () => {
    expect(META_PAGE_PROVIDER_SCOPED_SURFACES).toEqual([
      "provider.readiness_indicator",
    ]);
    expect(META_PAGE_PAGE_SCOPED_SURFACES).toEqual([
      "sync_status_pill",
      "meta_account_day_label",
      "page_status_banner",
      "kpi_row",
      "campaign_list",
      "campaign_detail",
      "breakdowns.age",
      "breakdowns.location",
      "breakdowns.placement",
      "adsets",
      "recommendations",
      "empty_state",
    ]);
    expect(
      META_PAGE_PROVIDER_SCOPED_SURFACES.some((surface) =>
        META_PAGE_PAGE_SCOPED_SURFACES.includes(surface as never)
      )
    ).toBe(false);
  });

  it("stays aligned with page readiness required surface keys", () => {
    expect(getMetaRequiredPageSurfaceKeys()).toEqual(META_PAGE_REQUIRED_SURFACE_ORDER);
  });

  it("keeps the truth-class legend explicit", () => {
    expect(META_PAGE_TRUTH_CLASSES).toEqual([
      "historical_warehouse",
      "current_day_live",
      "conditional_drilldown",
      "ai_exception",
    ]);
  });
});
