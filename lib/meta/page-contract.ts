import type { MetaPageSurfaceKey } from "@/lib/meta/status-types";

export const META_PAGE_REQUIRED_SURFACES = [
  "summary",
  "campaigns",
  "breakdowns.age",
  "breakdowns.location",
  "breakdowns.placement",
] as const satisfies readonly MetaPageSurfaceKey[];

export const META_PAGE_REQUIRED_SURFACE_ORDER = [
  ...META_PAGE_REQUIRED_SURFACES,
] as const satisfies readonly MetaPageSurfaceKey[];

export const META_PAGE_OPTIONAL_SURFACES = [
  "adsets",
  "recommendations",
] as const satisfies readonly MetaPageSurfaceKey[];

export const META_PAGE_NON_BLOCKING_SURFACES = [
  ...META_PAGE_OPTIONAL_SURFACES,
] as const satisfies readonly MetaPageSurfaceKey[];

export const META_PAGE_PROVIDER_SCOPED_SURFACES = [
  "provider.readiness_indicator",
] as const;

export const META_PAGE_PAGE_SCOPED_SURFACES = [
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
] as const;

export const META_PAGE_TRUTH_CLASSES = [
  "historical_warehouse",
  "current_day_live",
  "conditional_drilldown",
  "deterministic_decision_engine",
] as const;
