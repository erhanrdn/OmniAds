export const CREATIVE_PHASES = ["test", "scale", "post-scale"] as const;

export type CreativePhase = (typeof CREATIVE_PHASES)[number];

export const CREATIVE_PHASE_SOURCES = [
  "campaign_family_explicit",
  "naming_convention",
  "spend_threshold",
  "fatigue_override_in_test_family",
  "fatigue_override_in_scale",
  "default_test",
] as const;

export type CreativePhaseSource = (typeof CREATIVE_PHASE_SOURCES)[number];

export interface CreativePhaseResolution {
  phase: CreativePhase;
  phaseSource: CreativePhaseSource;
  fatigueDetected: boolean;
}

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
    spend?: number | null;
    roas?: number | null;
  } | null;
  long90d?: {
    roas?: number | null;
  } | null;
  breakEvenRoas?: number | null;
  campaign?: {
    metaFamily?: string | null;
    lane?: string | null;
    namingConvention?: string | null;
  } | null;
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

function normalizeSignal(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function campaignFamilyPhase(input: CreativePhaseInput["campaign"]): CreativePhase | null {
  const lane = normalizeSignal(input?.lane);
  if (lane === "scaling" || lane === "scale") return "scale";
  if (lane === "test" || lane === "testing" || lane === "validation") return "test";

  const family = normalizeSignal(input?.metaFamily);
  if (family === "scale_cbo" || family === "scale_abo") return "scale";
  if (family === "test_cbo" || family === "test_dct") return "test";
  return null;
}

export function parseCreativePhaseNamingConvention(
  value: string | null | undefined,
): CreativePhase | null {
  const name = value?.trim();
  if (!name) return null;

  if (/^(TEST[_-]|T[_-]\d)/i.test(name) || /_TEST$/i.test(name)) return "test";
  if (/^(SCALE[_-]|S[_-]\d|CBO[_-]|ABO[_-])/i.test(name)) return "scale";
  return null;
}

function hasPhaseFatigue(input: CreativePhaseInput) {
  const spend = finite(input.spend30d) ? input.spend30d : 0;
  const purchases = finite(input.purchases30d) ? input.purchases30d : 0;
  const breakEven = finite(input.breakEvenRoas) && input.breakEvenRoas > 0 ? input.breakEvenRoas : 1;
  const recentRoas = input.recent7d?.roas;
  const longRoas = input.long90d?.roas;
  const ratio = recentToLongRatio(input);

  if (!finite(recentRoas) || !finite(longRoas) || longRoas <= 0 || !finite(ratio)) {
    return false;
  }

  if (spend < 75) {
    return false;
  }

  if (ratio === 0 && spend >= 100 && purchases >= 1) {
    return true;
  }

  if (purchases >= 8 && spend >= 200 && ratio < 0.575 && recentRoas < longRoas * 0.6) {
    return true;
  }

  if (ratio < 0.575 && recentRoas < breakEven * 0.7 && longRoas >= breakEven * 0.8) {
    return true;
  }

  const recentSpend = input.recent7d?.spend;
  return ratio < 0.4 && finite(recentSpend) && recentSpend > 30 && (spend >= 100 || purchases >= 2);
}

function spendThresholdPhase(input: CreativePhaseInput): CreativePhase | null {
  const spend = finite(input.spend30d) ? input.spend30d : 0;
  const purchases = finite(input.purchases30d) ? input.purchases30d : 0;
  const medianSpend = finite(input.baseline?.medianSpend) ? input.baseline!.medianSpend! : null;
  const spendRatio = spendToMedian(input);

  if (finite(spendRatio) && spendRatio >= 5) {
    return "scale";
  }

  if (
    spend >= 5_000 &&
    input.activeStatus === true &&
    purchases >= 8 &&
    (!finite(spendRatio) || spendRatio >= 1.5)
  ) {
    return "scale";
  }

  if (medianSpend != null && spend >= 2 * medianSpend && purchases >= 8) {
    return "scale";
  }

  return null;
}

export function deriveCreativePhaseResolution(input: CreativePhaseInput): CreativePhaseResolution {
  const fatigueDetected = hasPhaseFatigue(input);
  const explicitFamilyPhase = campaignFamilyPhase(input.campaign);
  if (explicitFamilyPhase) {
    if (fatigueDetected) {
      return {
        phase: "post-scale",
        phaseSource:
          explicitFamilyPhase === "test"
            ? "fatigue_override_in_test_family"
            : "fatigue_override_in_scale",
        fatigueDetected,
      };
    }
    return {
      phase: explicitFamilyPhase,
      phaseSource: "campaign_family_explicit",
      fatigueDetected,
    };
  }

  const namingPhase = parseCreativePhaseNamingConvention(input.campaign?.namingConvention);
  if (namingPhase) {
    if (fatigueDetected) {
      return {
        phase: "post-scale",
        phaseSource:
          namingPhase === "test" ? "fatigue_override_in_test_family" : "fatigue_override_in_scale",
        fatigueDetected,
      };
    }
    return {
      phase: namingPhase,
      phaseSource: "naming_convention",
      fatigueDetected,
    };
  }

  if (fatigueDetected) {
    return {
      phase: "post-scale",
      phaseSource: "fatigue_override_in_scale",
      fatigueDetected,
    };
  }

  const spendPhase = spendThresholdPhase(input);
  if (spendPhase) {
    return {
      phase: spendPhase,
      phaseSource: "spend_threshold",
      fatigueDetected,
    };
  }

  return {
    phase: "test",
    phaseSource: "default_test",
    fatigueDetected,
  };
}

export function deriveCreativePhase(input: CreativePhaseInput): CreativePhase {
  return deriveCreativePhaseResolution(input).phase;
}
