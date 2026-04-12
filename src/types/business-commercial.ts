import type {
  OperatorAnalyticsWindow,
  OperatorDecisionWindows,
  OperatorHistoricalMemory,
} from "@/src/types/operator-decision";
import type {
  DecisionSafeActionLabel,
  DecisionSurfaceAuthority,
} from "@/src/types/decision-trust";

export const BUSINESS_RISK_POSTURES = ["conservative", "balanced", "aggressive"] as const;
export type BusinessRiskPosture = (typeof BUSINESS_RISK_POSTURES)[number];

export const BUSINESS_COUNTRY_SERVICEABILITY = ["full", "limited", "blocked"] as const;
export type BusinessCountryServiceability = (typeof BUSINESS_COUNTRY_SERVICEABILITY)[number];

export const BUSINESS_COUNTRY_PRIORITY_TIERS = ["tier_1", "tier_2", "tier_3"] as const;
export type BusinessCountryPriorityTier = (typeof BUSINESS_COUNTRY_PRIORITY_TIERS)[number];

export const BUSINESS_COUNTRY_SCALE_OVERRIDES = [
  "default",
  "prefer_scale",
  "hold",
  "deprioritize",
] as const;
export type BusinessCountryScaleOverride = (typeof BUSINESS_COUNTRY_SCALE_OVERRIDES)[number];

export const BUSINESS_PROMO_TYPES = [
  "sale",
  "launch",
  "clearance",
  "seasonal",
  "other",
] as const;
export type BusinessPromoType = (typeof BUSINESS_PROMO_TYPES)[number];

export const BUSINESS_PROMO_SEVERITIES = ["low", "medium", "high"] as const;
export type BusinessPromoSeverity = (typeof BUSINESS_PROMO_SEVERITIES)[number];

export const BUSINESS_ISSUE_STATUSES = ["none", "watch", "critical"] as const;
export type BusinessIssueStatus = (typeof BUSINESS_ISSUE_STATUSES)[number];

export const BUSINESS_STOCK_PRESSURE_STATUSES = ["healthy", "watch", "blocked"] as const;
export type BusinessStockPressureStatus = (typeof BUSINESS_STOCK_PRESSURE_STATUSES)[number];

export const BUSINESS_COMMERCIAL_COMPLETENESS_STATES = [
  "complete",
  "partial",
  "missing",
] as const;
export type BusinessCommercialCompletenessState =
  (typeof BUSINESS_COMMERCIAL_COMPLETENESS_STATES)[number];

export const BUSINESS_COMMERCIAL_FRESHNESS_STATES = [
  "fresh",
  "stale",
  "missing",
] as const;
export type BusinessCommercialFreshnessState =
  (typeof BUSINESS_COMMERCIAL_FRESHNESS_STATES)[number];

export const BUSINESS_DECISION_CALIBRATION_CHANNELS = [
  "meta",
  "creative",
  "command_center",
] as const;
export type BusinessDecisionCalibrationChannel =
  (typeof BUSINESS_DECISION_CALIBRATION_CHANNELS)[number];

export const BUSINESS_DECISION_OBJECTIVE_FAMILIES = [
  "sales",
  "catalog",
  "leads",
  "traffic",
  "awareness",
  "engagement",
  "unknown",
] as const;
export type BusinessDecisionObjectiveFamily =
  (typeof BUSINESS_DECISION_OBJECTIVE_FAMILIES)[number];

export const BUSINESS_DECISION_BID_REGIMES = [
  "open",
  "cost_cap",
  "bid_cap",
  "roas_floor",
  "unknown",
] as const;
export type BusinessDecisionBidRegime =
  (typeof BUSINESS_DECISION_BID_REGIMES)[number];

export type BusinessCommercialThresholdSource =
  | "configured_targets"
  | "conservative_fallback";

export type AccountOperatingMode =
  | "Recovery"
  | "Peak / Promo"
  | "Margin Protect"
  | "Exploit"
  | "Stabilize"
  | "Explore";

export interface BusinessCommercialFreshnessMeta {
  status: BusinessCommercialFreshnessState;
  updatedAt: string | null;
  ageHours: number | null;
  reason: string | null;
}

export interface BusinessCommercialSectionMeta {
  configured: boolean;
  itemCount: number;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
  completeness?: BusinessCommercialCompletenessState;
  freshness?: BusinessCommercialFreshnessMeta;
  blocking?: boolean;
}

export interface BusinessTargetPackData {
  targetCpa: number | null;
  targetRoas: number | null;
  breakEvenCpa: number | null;
  breakEvenRoas: number | null;
  contributionMarginAssumption: number | null;
  aovAssumption: number | null;
  newCustomerWeight: number | null;
  defaultRiskPosture: BusinessRiskPosture;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface BusinessCountryEconomicsRow {
  countryCode: string;
  economicsMultiplier: number | null;
  marginModifier: number | null;
  serviceability: BusinessCountryServiceability;
  priorityTier: BusinessCountryPriorityTier;
  scaleOverride: BusinessCountryScaleOverride;
  notes: string | null;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface BusinessPromoCalendarEvent {
  eventId: string;
  title: string;
  promoType: BusinessPromoType;
  severity: BusinessPromoSeverity;
  startDate: string;
  endDate: string;
  affectedScope: string | null;
  notes: string | null;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface BusinessOperatingConstraints {
  siteIssueStatus: BusinessIssueStatus;
  checkoutIssueStatus: BusinessIssueStatus;
  conversionTrackingIssueStatus: BusinessIssueStatus;
  feedIssueStatus: BusinessIssueStatus;
  stockPressureStatus: BusinessStockPressureStatus;
  landingPageConcern: string | null;
  merchandisingConcern: string | null;
  manualDoNotScaleReason: string | null;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface BusinessCostModelContext {
  cogsPercent: number;
  shippingPercent: number;
  feePercent: number;
  fixedCost: number;
  updatedAt: string | null;
}

export interface BusinessDecisionCalibrationProfile {
  channel: BusinessDecisionCalibrationChannel;
  objectiveFamily: BusinessDecisionObjectiveFamily;
  bidRegime: BusinessDecisionBidRegime;
  archetype: string;
  targetRoasMultiplier: number | null;
  breakEvenRoasMultiplier: number | null;
  targetCpaMultiplier: number | null;
  breakEvenCpaMultiplier: number | null;
  confidenceCap: number | null;
  actionCeiling: DecisionSafeActionLabel | null;
  notes: string | null;
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface BusinessDecisionCalibrationSummary {
  profileCount: number;
  channels: BusinessDecisionCalibrationChannel[];
  updatedAt: string | null;
}

export interface BusinessCommercialThresholdSummary {
  source: BusinessCommercialThresholdSource;
  targetRoas: number | null;
  breakEvenRoas: number | null;
  targetCpa: number | null;
  breakEvenCpa: number | null;
  defaultRiskPosture: BusinessRiskPosture;
}

export interface BusinessCommercialCoverageSummary {
  completeness: BusinessCommercialCompletenessState;
  freshness: BusinessCommercialFreshnessMeta;
  blockingReasons: string[];
  nonBlockingReasons: string[];
  actionCeilings: DecisionSafeActionLabel[];
  thresholds: BusinessCommercialThresholdSummary;
  calibration: BusinessDecisionCalibrationSummary;
}

export interface BusinessCommercialTruthSnapshot {
  businessId: string;
  targetPack: BusinessTargetPackData | null;
  countryEconomics: BusinessCountryEconomicsRow[];
  promoCalendar: BusinessPromoCalendarEvent[];
  operatingConstraints: BusinessOperatingConstraints | null;
  costModelContext: BusinessCostModelContext | null;
  calibrationProfiles?: BusinessDecisionCalibrationProfile[];
  sectionMeta: {
    targetPack: BusinessCommercialSectionMeta;
    countryEconomics: BusinessCommercialSectionMeta;
    promoCalendar: BusinessCommercialSectionMeta;
    operatingConstraints: BusinessCommercialSectionMeta;
  };
  coverage?: BusinessCommercialCoverageSummary;
}

export interface AccountOperatingModeLineItem {
  label: string;
  detail: string;
}

export interface AccountOperatingModePayload {
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsWindow: OperatorAnalyticsWindow;
  decisionWindows: OperatorDecisionWindows;
  historicalMemory: OperatorHistoricalMemory;
  decisionAsOf: string;
  currentMode: AccountOperatingMode;
  recommendedMode: AccountOperatingMode;
  confidence: number;
  why: string[];
  guardrails: string[];
  changeTriggers: string[];
  activeCommercialInputs: AccountOperatingModeLineItem[];
  platformInputs: AccountOperatingModeLineItem[];
  missingInputs: string[];
  degradedMode: {
    active: boolean;
    confidenceCap: number | null;
    reasons: string[];
    safeActionLabels: DecisionSafeActionLabel[];
  };
  commercialSummary?: BusinessCommercialCoverageSummary;
  authority?: DecisionSurfaceAuthority;
}

function createSectionMeta(): BusinessCommercialSectionMeta {
  return {
    configured: false,
    itemCount: 0,
    sourceLabel: null,
    updatedAt: null,
    updatedByUserId: null,
    completeness: "missing",
    freshness: {
      status: "missing",
      updatedAt: null,
      ageHours: null,
      reason: "This commercial section is not configured yet.",
    },
    blocking: false,
  };
}

function createRowId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyTargetPack(): BusinessTargetPackData {
  return {
    targetCpa: null,
    targetRoas: null,
    breakEvenCpa: null,
    breakEvenRoas: null,
    contributionMarginAssumption: null,
    aovAssumption: null,
    newCustomerWeight: null,
    defaultRiskPosture: "balanced",
    sourceLabel: "settings_manual_entry",
    updatedAt: null,
    updatedByUserId: null,
  };
}

export function createEmptyCountryEconomicsRow(
  overrides?: Partial<BusinessCountryEconomicsRow>,
): BusinessCountryEconomicsRow {
  return {
    countryCode: "",
    economicsMultiplier: null,
    marginModifier: null,
    serviceability: "full",
    priorityTier: "tier_2",
    scaleOverride: "default",
    notes: null,
    sourceLabel: "settings_manual_entry",
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

export function createEmptyPromoCalendarEvent(
  overrides?: Partial<BusinessPromoCalendarEvent>,
): BusinessPromoCalendarEvent {
  return {
    eventId: createRowId("promo"),
    title: "",
    promoType: "sale",
    severity: "medium",
    startDate: "",
    endDate: "",
    affectedScope: null,
    notes: null,
    sourceLabel: "settings_manual_entry",
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

export function createEmptyOperatingConstraints(): BusinessOperatingConstraints {
  return {
    siteIssueStatus: "none",
    checkoutIssueStatus: "none",
    conversionTrackingIssueStatus: "none",
    feedIssueStatus: "none",
    stockPressureStatus: "healthy",
    landingPageConcern: null,
    merchandisingConcern: null,
    manualDoNotScaleReason: null,
    sourceLabel: "settings_manual_entry",
    updatedAt: null,
    updatedByUserId: null,
  };
}

export function createEmptyDecisionCalibrationProfile(
  overrides?: Partial<BusinessDecisionCalibrationProfile>,
): BusinessDecisionCalibrationProfile {
  return {
    channel: "meta",
    objectiveFamily: "sales",
    bidRegime: "open",
    archetype: "default",
    targetRoasMultiplier: null,
    breakEvenRoasMultiplier: null,
    targetCpaMultiplier: null,
    breakEvenCpaMultiplier: null,
    confidenceCap: null,
    actionCeiling: null,
    notes: null,
    sourceLabel: "settings_manual_entry",
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

export function createEmptyBusinessCommercialCoverageSummary(): BusinessCommercialCoverageSummary {
  return {
    completeness: "missing",
    freshness: {
      status: "missing",
      updatedAt: null,
      ageHours: null,
      reason: "Commercial truth is not configured yet.",
    },
    blockingReasons: [
      "Target pack is missing, so ROAS/CPA thresholds stay on conservative fallback defaults.",
      "Country economics are missing, so GEO-aware scaling remains review-safe.",
      "Operating constraints are missing, so action ceilings stay conservative.",
    ],
    nonBlockingReasons: [
      "Promo calendar is optional, but promo-aware posture remains conservative until windows are configured.",
    ],
    actionCeilings: ["review_hold", "monitor_low_truth", "degraded_no_scale"],
    thresholds: {
      source: "conservative_fallback",
      targetRoas: 2.5,
      breakEvenRoas: 1.8,
      targetCpa: 40,
      breakEvenCpa: 55,
      defaultRiskPosture: "balanced",
    },
    calibration: {
      profileCount: 0,
      channels: [],
      updatedAt: null,
    },
  };
}

export function createEmptyBusinessCommercialTruthSnapshot(
  businessId: string,
): BusinessCommercialTruthSnapshot {
  return {
    businessId,
    targetPack: null,
    countryEconomics: [],
    promoCalendar: [],
    operatingConstraints: null,
    costModelContext: null,
    calibrationProfiles: [],
    sectionMeta: {
      targetPack: createSectionMeta(),
      countryEconomics: createSectionMeta(),
      promoCalendar: createSectionMeta(),
      operatingConstraints: createSectionMeta(),
    },
    coverage: createEmptyBusinessCommercialCoverageSummary(),
  };
}
