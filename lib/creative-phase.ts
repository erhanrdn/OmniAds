export const CREATIVE_PHASES = ["test", "scale", "post-scale"] as const;

export type CreativePhase = (typeof CREATIVE_PHASES)[number];

export interface CreativePhaseInput {
  spend30d?: number | null;
  purchases30d?: number | null;
  activeStatus?: boolean | null;
  baseline?: {
    medianSpend?: number | null;
  } | null;
  relative?: {
    spendToMedian?: number | null;
  } | null;
  recent7d?: {
    roas?: number | null;
  } | null;
  long90d?: {
    roas?: number | null;
  } | null;
  breakEvenRoas?: number | null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function spendToMedian(input: CreativePhaseInput) {
  if (finite(input.relative?.spendToMedian)) return input.relative!.spendToMedian!;
  const spend = input.spend30d;
  const medianSpend = input.baseline?.medianSpend;
  if (!finite(spend) || !finite(medianSpend) || medianSpend <= 0) return null;
  return spend / medianSpend;
}

function recentToLongRatio(input: CreativePhaseInput) {
  const recent = input.recent7d?.roas;
  const long = input.long90d?.roas;
  if (!finite(recent) || !finite(long) || long <= 0) return null;
  return recent / long;
}

export function deriveCreativePhase(input: CreativePhaseInput): CreativePhase {
  const spend = finite(input.spend30d) ? input.spend30d : 0;
  const purchases = finite(input.purchases30d) ? input.purchases30d : 0;
  const medianSpend = finite(input.baseline?.medianSpend) ? input.baseline!.medianSpend! : null;
  const spendRatio = spendToMedian(input);
  const breakEven = finite(input.breakEvenRoas) && input.breakEvenRoas > 0 ? input.breakEvenRoas : 1;
  const recentRoas = input.recent7d?.roas;
  const ratio = recentToLongRatio(input);

  if (spend >= 5_000 || (finite(spendRatio) && spendRatio >= 5)) {
    return "scale";
  }

  if (
    medianSpend != null &&
    spend >= 2 * medianSpend &&
    purchases >= 8 &&
    input.activeStatus === true
  ) {
    return "scale";
  }

  if (
    finite(ratio) &&
    (ratio < 0.4 ||
      (ratio < 0.55 && finite(recentRoas) && recentRoas < breakEven * 0.6))
  ) {
    return "post-scale";
  }

  return "test";
}
