import type { OperatorInstruction } from "@/src/types/operator-decision";

export const OPERATOR_AUTHORITY_STATES = [
  "act_now",
  "needs_truth",
  "blocked",
  "watch",
  "no_action",
] as const;

export type OperatorAuthorityState = (typeof OPERATOR_AUTHORITY_STATES)[number];

export type OperatorConfidenceBand = "High" | "Medium" | "Limited";

export interface OperatorSurfaceMetric {
  label: string;
  value: string;
}

export interface OperatorSurfaceItem {
  id: string;
  title: string;
  subtitle?: string | null;
  primaryAction: string;
  authorityState: OperatorAuthorityState;
  authorityLabel?: string;
  reason: string;
  blocker?: string | null;
  confidence: OperatorConfidenceBand;
  secondaryLabels?: string[];
  metrics: OperatorSurfaceMetric[];
  muted?: boolean;
  mutedReason?: string | null;
  instruction?: OperatorInstruction | null;
}

export interface OperatorSurfaceBucket {
  key: OperatorAuthorityState;
  label: string;
  summary: string;
  rows: OperatorSurfaceItem[];
  mutedCount: number;
}

export interface OperatorSurfaceModel {
  surfaceLabel: string;
  heading: string;
  headline: string;
  note: string;
  emphasis: OperatorAuthorityState;
  authorityLabels?: Partial<Record<OperatorAuthorityState, string>>;
  blocker?: string | null;
  buckets: OperatorSurfaceBucket[];
  hiddenSummary?: string | null;
}

const DEFAULT_BUCKET_LABELS: Record<OperatorAuthorityState, string> = {
  act_now: "Act now",
  needs_truth: "Needs truth",
  blocked: "Blocked",
  watch: "Watch",
  no_action: "No action",
};

const DEFAULT_BUCKET_SUMMARIES: Record<OperatorAuthorityState, string> = {
  act_now: "Explicit operator moves with enough signal to act safely.",
  needs_truth: "Material rows that need more truth before a stronger move.",
  blocked: "Rows held back by preview, compatibility, or hard constraints.",
  watch: "Visible rows where the next trigger matters more than an immediate change.",
  no_action: "Rows that should stay protected or untouched for now.",
};

export function operatorConfidenceBand(confidence: number | null | undefined): OperatorConfidenceBand {
  if ((confidence ?? 0) >= 0.82) return "High";
  if ((confidence ?? 0) >= 0.66) return "Medium";
  return "Limited";
}

export function operatorStateLabel(state: OperatorAuthorityState) {
  return DEFAULT_BUCKET_LABELS[state];
}

export function sentenceCase(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return normalized[0].toUpperCase() + normalized.slice(1);
}

export function titleFromEnum(value: string | null | undefined) {
  return sentenceCase((value ?? "").replaceAll("_", " "));
}

export function buildOperatorBuckets(
  items: OperatorSurfaceItem[],
  config?: {
    labels?: Partial<Record<OperatorAuthorityState, string>>;
    summaries?: Partial<Record<OperatorAuthorityState, string>>;
    order?: OperatorAuthorityState[];
  },
) {
  const labels = { ...DEFAULT_BUCKET_LABELS, ...(config?.labels ?? {}) };
  const summaries = { ...DEFAULT_BUCKET_SUMMARIES, ...(config?.summaries ?? {}) };
  const order = config?.order ?? OPERATOR_AUTHORITY_STATES;

  return order
    .map((key) => {
      const matching = items.filter((item) => item.authorityState === key);
      return {
        key,
        label: labels[key],
        summary: summaries[key],
        rows: matching.filter((item) => !item.muted),
        mutedCount: matching.filter((item) => item.muted).length,
      } satisfies OperatorSurfaceBucket;
    })
    .filter((bucket) => bucket.rows.length > 0 || bucket.mutedCount > 0);
}
