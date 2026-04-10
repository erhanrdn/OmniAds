import { buildGoogleAdsOperatorActionCard } from "@/lib/google-ads/advisor-action-contract";
import { getGoogleAdsAdvisorAiStructuredAssistBoundaryState } from "@/lib/google-ads/decision-engine-config";
import type {
  GoogleAdvisorActionCard,
  GoogleAdvisorActionListBlock,
  GoogleAdvisorStructuredAssistFailureCategory,
  GoogleAdvisorMetadata,
  GoogleAdvisorResponse,
  GoogleRecommendation,
  GoogleRecommendationEvidence,
} from "@/lib/google-ads/growth-advisor-types";
import { getOpenAI } from "@/lib/openai";

export const GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL = "gpt-5-nano" as const;
export const GOOGLE_ADVISOR_STRUCTURED_ASSIST_PROMPT_VERSION =
  "google_ads_ai_structured_assist_v1" as const;
const GOOGLE_ADVISOR_STRUCTURED_ASSIST_TIMEOUT_MS = 8_000;
const ELIGIBLE_RECOMMENDATION_TYPES = new Set<GoogleRecommendation["type"]>([
  "operating_model_gap",
]);
const LIST_BLOCK_KINDS = new Set<GoogleAdvisorActionListBlock["kind"]>([
  "change",
  "suppressed",
  "guardrail",
  "preview",
  "blocker",
  "informational",
]);
const LIST_BLOCK_TONES = new Set<GoogleAdvisorActionListBlock["tone"]>([
  "default",
  "primary",
  "danger",
  "muted",
]);

interface GoogleAdvisorStructuredAssistDraft {
  primaryAction?: unknown;
  scopeLabel?: unknown;
  exactChanges?: unknown;
  expectedEffect?: unknown;
  whyThisNow?: unknown;
  evidence?: unknown;
  validation?: unknown;
  rollback?: unknown;
  blockedBecause?: unknown;
  coachNote?: unknown;
}

interface GoogleAdvisorStructuredAssistValidated {
  primaryAction: string;
  scopeLabel: string;
  exactChanges: GoogleAdvisorActionListBlock[];
  whyThisNow: string;
  evidence: string[];
  validation: string[];
  rollback: string[];
  blockedBecause: string[];
  coachNote: string | null;
}

interface StructuredAssistValidationFailure {
  ok: false;
  reason: string;
  category: GoogleAdvisorStructuredAssistFailureCategory;
}

interface StructuredAssistValidationSuccess {
  ok: true;
  value: GoogleAdvisorStructuredAssistValidated;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatEvidencePoint(entry: GoogleRecommendationEvidence) {
  return `${entry.label}: ${entry.value}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function containsRiskyForecastLanguage(value: string) {
  const normalized = value.toLowerCase();
  return (
    /\$\s?\d/.test(value) ||
    /\b\d+(\.\d+)?\s?%/.test(value) ||
    /\b\d+(\.\d+)?x\b/i.test(value) ||
    normalized.includes("roas") ||
    normalized.includes("cpa") ||
    normalized.includes("revenue lift") ||
    normalized.includes("waste recovery") ||
    normalized.includes("efficiency lift")
  );
}

function buildAllowedExactItems(recommendation: GoogleRecommendation, baselineCard: GoogleAdvisorActionCard) {
  return new Set(
    uniqueStrings([
      ...baselineCard.exactChanges.flatMap((block) => block.items),
      ...(recommendation.overlapEntities ?? []),
      ...(recommendation.negativeQueries ?? []),
      ...(recommendation.suppressedQueries ?? []),
      ...(recommendation.negativeGuardrails ?? []),
      ...(recommendation.seedQueriesExact ?? []),
      ...(recommendation.seedQueriesPhrase ?? []),
      ...(recommendation.seedThemesBroad ?? []),
      ...(recommendation.promoteToExact ?? []),
      ...(recommendation.promoteToPhrase ?? []),
      ...(recommendation.broadDiscoveryThemes ?? []),
      ...(recommendation.startingSkuClusters ?? []),
      ...(recommendation.heroSkuClusters ?? []),
      ...(recommendation.scaleSkuClusters ?? []),
      ...(recommendation.reduceSkuClusters ?? []),
      ...(recommendation.hiddenWinnerSkuClusters ?? []),
      ...(recommendation.scaleReadyAssets ?? []),
      ...(recommendation.testOnlyAssets ?? []),
      ...(recommendation.replaceAssets ?? []),
      ...(recommendation.replacementAngles ?? []),
      ...(recommendation.weakAssetGroups ?? []),
      ...(recommendation.keepSeparateAssetGroups ?? []),
      ...(recommendation.diagnosticFlags ?? []),
      ...(recommendation.playbookSteps ?? []),
      ...(recommendation.prerequisites ?? []),
      ...(recommendation.orderedHandoffSteps ?? []),
      ...(recommendation.affectedFamilies ?? []).map(labelize),
      recommendation.shoppingRationale ?? null,
      recommendation.reallocationBand ?? null,
      baselineCard.scope.label,
      recommendation.entityName ?? null,
    ])
  );
}

function isEligibleForStructuredAssist(
  recommendation: GoogleRecommendation,
  baselineCard: GoogleAdvisorActionCard
) {
  if (!ELIGIBLE_RECOMMENDATION_TYPES.has(recommendation.type)) return false;
  if (baselineCard.blockedBecause.length > 0) return false;
  return (
    baselineCard.exactChangePayload.kind === "generic_manual_action" ||
    (baselineCard.exactChangePayload.kind === "blocked_or_insufficient_evidence" &&
      baselineCard.exactChangePayload.state === "insufficient_evidence")
  );
}

function buildUserPayload(recommendation: GoogleRecommendation, baselineCard: GoogleAdvisorActionCard) {
  const allowedEvidence = baselineCard.evidence.map(formatEvidencePoint);
  const allowedValidation = uniqueStrings(baselineCard.validation);
  const allowedRollback = uniqueStrings(baselineCard.rollback);

  return {
    recommendationType: recommendation.type,
    title: recommendation.title,
    summary: recommendation.summary,
    why: recommendation.why,
    recommendedAction: recommendation.recommendedAction,
    evidence: recommendation.evidence,
    prerequisites: recommendation.prerequisites ?? [],
    playbookSteps: recommendation.playbookSteps ?? [],
    affectedFamilies: (recommendation.affectedFamilies ?? []).map(labelize),
    structuredFields: {
      negativeQueries: recommendation.negativeQueries ?? [],
      suppressedQueries: recommendation.suppressedQueries ?? [],
      overlapEntities: recommendation.overlapEntities ?? [],
      scaleSkuClusters: recommendation.scaleSkuClusters ?? [],
      reduceSkuClusters: recommendation.reduceSkuClusters ?? [],
      hiddenWinnerSkuClusters: recommendation.hiddenWinnerSkuClusters ?? [],
      heroSkuClusters: recommendation.heroSkuClusters ?? [],
      weakAssetGroups: recommendation.weakAssetGroups ?? [],
      keepSeparateAssetGroups: recommendation.keepSeparateAssetGroups ?? [],
      replaceAssets: recommendation.replaceAssets ?? [],
      replacementAngles: recommendation.replacementAngles ?? [],
      reallocationBand: recommendation.reallocationBand ?? null,
      reallocationPreview: recommendation.reallocationPreview ?? null,
      targetPreview: recommendation.portfolioTargetAdjustmentPreview ?? null,
      targetBlockedBecause: uniqueStrings([
        recommendation.mutateEligibilityReason,
        recommendation.jointAllocatorBlockedReason,
        recommendation.portfolioBlockedReason,
      ]),
    },
    deterministicFallback: {
      primaryAction: baselineCard.primaryAction,
      scopeLabel: baselineCard.scope.label,
      exactChanges: baselineCard.exactChanges,
      expectedEffect: baselineCard.expectedEffect,
      whyThisNow: baselineCard.whyThisNow,
      evidence: allowedEvidence,
      validation: allowedValidation,
      rollback: allowedRollback,
      blockedBecause: baselineCard.blockedBecause,
    },
    allowlists: {
      exactItems: Array.from(buildAllowedExactItems(recommendation, baselineCard)),
      evidence: allowedEvidence,
      validation: allowedValidation,
      rollback: allowedRollback,
      blockedBecause: baselineCard.blockedBecause,
      expectedEffect: baselineCard.expectedEffect,
    },
  };
}

function buildSystemPrompt() {
  return [
    "You are assisting a Google Ads operator console.",
    "Return JSON only.",
    "You are not the source of truth. The deterministic recommendation data is the source of truth.",
    "Use only the provided allowlisted exact items, evidence, validation items, rollback items, and blocked reasons.",
    "Never invent queries, SKUs, asset groups, campaigns, targets, uplift numbers, ROAS, CPA, spend deltas, or percentages.",
    "If the provided data is insufficient, keep the structure conservative and do not fabricate exact items.",
    "Keep manual-plan wording. Do not imply autonomous execution or write-back.",
    "expectedEffect must restate the provided deterministic expectedEffect only. Do not change its estimationMode or estimateLabel.",
    `Prompt version: ${GOOGLE_ADVISOR_STRUCTURED_ASSIST_PROMPT_VERSION}.`,
  ].join(" ");
}

function buildStructuredAssistState(
  state: NonNullable<GoogleRecommendation["structuredAssist"]>["state"],
  reason: string,
  model: string | null,
  options?: {
    filledFields?: string[];
    validationFailureCategory?: GoogleAdvisorStructuredAssistFailureCategory | null;
    attemptedAt?: string | null;
  }
) {
  return {
    state,
    mode: "snapshot_time" as const,
    model,
    reason,
    filledFields: options?.filledFields ?? [],
    promptVersion: GOOGLE_ADVISOR_STRUCTURED_ASSIST_PROMPT_VERSION,
    attemptedAt: options?.attemptedAt ?? null,
    validationFailureCategory: options?.validationFailureCategory ?? null,
  } satisfies NonNullable<GoogleRecommendation["structuredAssist"]>;
}

function parseDraft(content: string): GoogleAdvisorStructuredAssistDraft | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isPlainObject(parsed) ? (parsed as GoogleAdvisorStructuredAssistDraft) : null;
  } catch {
    return null;
  }
}

function validationFailure(
  category: GoogleAdvisorStructuredAssistFailureCategory,
  reason: string
): StructuredAssistValidationFailure {
  return {
    ok: false,
    reason,
    category,
  };
}

function validateDraft(input: {
  draft: GoogleAdvisorStructuredAssistDraft;
  baselineCard: GoogleAdvisorActionCard;
  allowedExactItems: Set<string>;
}): StructuredAssistValidationFailure | StructuredAssistValidationSuccess {
  const { draft, baselineCard, allowedExactItems } = input;
  const primaryAction = typeof draft.primaryAction === "string" ? draft.primaryAction.trim() : "";
  const scopeLabel = typeof draft.scopeLabel === "string" ? draft.scopeLabel.trim() : "";
  const whyThisNow = typeof draft.whyThisNow === "string" ? draft.whyThisNow.trim() : "";
  const coachNote =
    typeof draft.coachNote === "string" && draft.coachNote.trim().length > 0 ? draft.coachNote.trim() : null;
  const evidence = uniqueStrings(asStringArray(draft.evidence));
  const validation = uniqueStrings(asStringArray(draft.validation));
  const rollback = uniqueStrings(asStringArray(draft.rollback));
  const blockedBecause = uniqueStrings(asStringArray(draft.blockedBecause));

  if (!primaryAction || !scopeLabel || !whyThisNow) {
    return validationFailure("schema", "AI assist response omitted required operator fields.");
  }

  if (containsRiskyForecastLanguage(primaryAction) || containsRiskyForecastLanguage(whyThisNow)) {
    return validationFailure("forecast_language", "AI assist introduced unsupported forecast or bidding language.");
  }

  const expectedEffect = isPlainObject(draft.expectedEffect) ? draft.expectedEffect : null;
  if (expectedEffect) {
    const estimationMode =
      typeof expectedEffect.estimationMode === "string" ? expectedEffect.estimationMode : null;
    const estimateLabel =
      typeof expectedEffect.estimateLabel === "string" ? expectedEffect.estimateLabel : null;
    if (estimationMode !== baselineCard.expectedEffect.estimationMode) {
      return validationFailure(
        "expected_effect",
        "AI assist tried to change deterministic expected-effect estimation mode."
      );
    }
    if ((estimateLabel ?? null) !== (baselineCard.expectedEffect.estimateLabel ?? null)) {
      return validationFailure(
        "expected_effect",
        "AI assist tried to introduce a new expected-effect estimate label."
      );
    }
  }

  const validEvidence = evidence.filter((entry) =>
    baselineCard.evidence.some((point) => formatEvidencePoint(point) === entry)
  );
  if (evidence.length > 0 && validEvidence.length !== evidence.length) {
    return validationFailure(
      "evidence",
      "AI assist referenced evidence that is not present in the deterministic recommendation."
    );
  }

  const validValidation = validation.filter((entry) => baselineCard.validation.includes(entry));
  if (validation.length > 0 && validValidation.length !== validation.length) {
    return validationFailure(
      "validation",
      "AI assist introduced validation steps outside the deterministic allowlist."
    );
  }

  const validRollback = rollback.filter((entry) => baselineCard.rollback.includes(entry));
  if (rollback.length > 0 && validRollback.length !== rollback.length) {
    return validationFailure(
      "rollback",
      "AI assist introduced rollback steps outside the deterministic allowlist."
    );
  }

  if (blockedBecause.length > 0) {
    return validationFailure(
      "blocker_state",
      "AI assist tried to change blocker state for an eligible deterministic fallback."
    );
  }

  const exactChanges = Array.isArray(draft.exactChanges) ? draft.exactChanges : [];
  const validatedExactChanges: GoogleAdvisorActionListBlock[] = [];

  for (const block of exactChanges) {
    if (!isPlainObject(block)) {
      return validationFailure("schema", "AI assist returned a malformed exact-change block.");
    }
    const label = typeof block.label === "string" ? block.label.trim() : "";
    const items = uniqueStrings(asStringArray(block.items));
    const emptyLabel = typeof block.emptyLabel === "string" ? block.emptyLabel.trim() : undefined;
    const kind = typeof block.kind === "string" ? block.kind : null;
    const tone = typeof block.tone === "string" ? block.tone : null;

    if (!label || !kind || !LIST_BLOCK_KINDS.has(kind as GoogleAdvisorActionListBlock["kind"])) {
      return validationFailure(
        "schema",
        "AI assist returned an exact-change block with an invalid label or kind."
      );
    }
    if (!tone || !LIST_BLOCK_TONES.has(tone as GoogleAdvisorActionListBlock["tone"])) {
      return validationFailure(
        "schema",
        "AI assist returned an exact-change block with an invalid tone."
      );
    }
    if (!items.every((item) => allowedExactItems.has(item))) {
      return validationFailure(
        "allowlist",
        "AI assist introduced exact items that are not present in the structured allowlist."
      );
    }

    validatedExactChanges.push({
      label,
      items,
      emptyLabel,
      kind: kind as GoogleAdvisorActionListBlock["kind"],
      tone: tone as GoogleAdvisorActionListBlock["tone"],
    });
  }

  if (!validatedExactChanges.some((block) => block.items.length > 0)) {
    return validationFailure("empty_output", "AI assist did not produce any validated exact-change items.");
  }

  return {
    ok: true,
    value: {
      primaryAction,
      scopeLabel,
      exactChanges: validatedExactChanges,
      whyThisNow,
      evidence: validEvidence,
      validation: validValidation,
      rollback: validRollback,
      blockedBecause: [],
      coachNote,
    },
  };
}

function mergeAiAssistCard(input: {
  baselineCard: GoogleAdvisorActionCard;
  recommendation: GoogleRecommendation;
  validated: GoogleAdvisorStructuredAssistValidated;
}) {
  const { baselineCard, recommendation, validated } = input;
  const selectedEvidence =
    validated.evidence.length > 0
      ? baselineCard.evidence.filter((entry) => validated.evidence.includes(formatEvidencePoint(entry)))
      : baselineCard.evidence;

  const nextCard: GoogleAdvisorActionCard = {
    ...baselineCard,
    assistMode: "ai_structured_assist",
    primaryAction: validated.primaryAction,
    scope: {
      ...baselineCard.scope,
      label: validated.scopeLabel,
    },
    exactChanges: validated.exactChanges,
    whyThisNow: validated.whyThisNow,
    evidence: selectedEvidence,
    validation: validated.validation.length > 0 ? validated.validation : baselineCard.validation,
    rollback: validated.rollback.length > 0 ? validated.rollback : baselineCard.rollback,
    blockedBecause: baselineCard.blockedBecause,
    coachNote: validated.coachNote ?? baselineCard.coachNote ?? recommendation.aiCommentary?.narrative ?? null,
  };

  const filledFields = [
    "primaryAction",
    "scope.label",
    "exactChanges",
    "whyThisNow",
    selectedEvidence !== baselineCard.evidence ? "evidence" : null,
    validated.validation.length > 0 ? "validation" : null,
    validated.rollback.length > 0 ? "rollback" : null,
    nextCard.coachNote !== baselineCard.coachNote ? "coachNote" : null,
  ].filter((entry): entry is string => typeof entry === "string");

  return { nextCard, filledFields };
}

async function requestStructuredAssistDraft(input: {
  recommendation: GoogleRecommendation;
  baselineCard: GoogleAdvisorActionCard;
}) {
  const openai = getOpenAI();
  const response = await Promise.race([
    openai.chat.completions.create({
      model: GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify(buildUserPayload(input.recommendation, input.baselineCard)),
        },
      ],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `AI structured assist request timed out after ${GOOGLE_ADVISOR_STRUCTURED_ASSIST_TIMEOUT_MS}ms.`
          )
        );
      }, GOOGLE_ADVISOR_STRUCTURED_ASSIST_TIMEOUT_MS);
    }),
  ]);

  return response.choices[0]?.message?.content ?? "";
}

export async function applyGoogleAdsStructuredAssist(input: {
  analysisMode: GoogleAdvisorMetadata["analysisMode"];
  advisorPayload: GoogleAdvisorResponse;
  businessId?: string | null;
}) {
  const assistBoundary = getGoogleAdsAdvisorAiStructuredAssistBoundaryState({
    businessId: input.businessId ?? null,
  });
  const metadataAssist = {
    enabled: assistBoundary.enabled,
    mode: "snapshot_time" as const,
    scope: "unmapped_only" as const,
    appliedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    eligibleCount: 0,
    promptVersion: GOOGLE_ADVISOR_STRUCTURED_ASSIST_PROMPT_VERSION,
    businessScoped: assistBoundary.businessScoped,
  };

  const recommendations = await Promise.all(
    input.advisorPayload.recommendations.map(async (recommendation) => {
      const baselineCard = buildGoogleAdsOperatorActionCard(recommendation, "native");

      if (input.analysisMode !== "snapshot") {
        metadataAssist.skippedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "not_requested",
            "AI structured assist only runs during snapshot generation.",
            null,
            { validationFailureCategory: "not_snapshot" }
          ),
          operatorActionCard: baselineCard,
        };
      }

      const eligibleForAssist = isEligibleForStructuredAssist(recommendation, baselineCard);
      if (eligibleForAssist) {
        metadataAssist.eligibleCount += 1;
      }

      if (!assistBoundary.enabled) {
        metadataAssist.skippedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "not_requested",
            "GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED is disabled.",
            null,
            { validationFailureCategory: "not_enabled" }
          ),
          operatorActionCard: baselineCard,
        };
      }

      if (!assistBoundary.businessAllowed) {
        metadataAssist.skippedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "not_requested",
            assistBoundary.businessScoped
              ? "Business is not in the AI structured assist allowlist."
              : "AI structured assist rollout has no business allowlist configured.",
            null,
            { validationFailureCategory: "not_allowlisted" }
          ),
          operatorActionCard: baselineCard,
        };
      }

      if (!eligibleForAssist) {
        metadataAssist.skippedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "not_requested",
            "Recommendation already has a deterministic specialized card or is not in the AI assist allowlist.",
            null,
            { validationFailureCategory: "not_eligible" }
          ),
          operatorActionCard: baselineCard,
        };
      }

      if (!process.env.OPENAI_API_KEY) {
        metadataAssist.failedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "not_configured",
            "OPENAI_API_KEY is not configured.",
            null,
            { validationFailureCategory: "not_configured" }
          ),
          operatorActionCard: baselineCard,
        };
      }

      const attemptedAt = new Date().toISOString();
      try {
        const content = await requestStructuredAssistDraft({
          recommendation,
          baselineCard,
        });
        if (!content.trim()) {
          metadataAssist.failedCount += 1;
          return {
            ...recommendation,
            structuredAssist: buildStructuredAssistState(
              "failed",
              "AI structured assist returned an empty response.",
              GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
              {
                attemptedAt,
                validationFailureCategory: "empty_output",
              }
            ),
            operatorActionCard: baselineCard,
          };
        }
        const draft = parseDraft(content);
        if (!draft) {
          metadataAssist.failedCount += 1;
          return {
            ...recommendation,
            structuredAssist: buildStructuredAssistState(
              "failed",
              "AI structured assist returned malformed JSON.",
              GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
              {
                attemptedAt,
                validationFailureCategory: "schema",
              }
            ),
            operatorActionCard: baselineCard,
          };
        }

        const validation = validateDraft({
          draft,
          baselineCard,
          allowedExactItems: buildAllowedExactItems(recommendation, baselineCard),
        });

        if (!validation.ok) {
          metadataAssist.rejectedCount += 1;
          return {
            ...recommendation,
            structuredAssist: buildStructuredAssistState(
              "rejected",
              validation.reason,
              GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
              {
                attemptedAt,
                validationFailureCategory: validation.category,
              }
            ),
            operatorActionCard: baselineCard,
          };
        }

        const merged = mergeAiAssistCard({
          baselineCard,
          recommendation,
          validated: validation.value,
        });

        metadataAssist.appliedCount += 1;
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "applied",
            "Structured AI assist applied to deterministic fallback recommendation fields.",
            GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
            {
              filledFields: merged.filledFields,
              attemptedAt,
            }
          ),
          operatorActionCard: merged.nextCard,
        };
      } catch (error) {
        metadataAssist.failedCount += 1;
        const message = error instanceof Error ? error.message : "Unknown AI structured assist failure.";
        const timeoutFailure = message.toLowerCase().includes("timed out");
        return {
          ...recommendation,
          structuredAssist: buildStructuredAssistState(
            "failed",
            message,
            GOOGLE_ADVISOR_STRUCTURED_ASSIST_MODEL,
            {
              attemptedAt,
              validationFailureCategory: timeoutFailure ? "timeout" : "transport",
            }
          ),
          operatorActionCard: baselineCard,
        };
      }
    })
  );

  const recommendationsById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation] as const));

  return {
    ...input.advisorPayload,
    recommendations,
    sections: input.advisorPayload.sections.map((section) => ({
      ...section,
      recommendations: section.recommendations.map(
        (recommendation) => recommendationsById.get(recommendation.id) ?? recommendation
      ),
    })),
    metadata: input.advisorPayload.metadata
      ? {
          ...input.advisorPayload.metadata,
          aiAssist: metadataAssist,
        }
      : undefined,
  };
}
