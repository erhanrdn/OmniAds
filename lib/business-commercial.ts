import { getDb } from "@/lib/db";
import {
  assertDbSchemaReady,
  getDbSchemaReadiness,
  isMissingRelationError,
} from "@/lib/db-schema-readiness";
import {
  getBusinessCostModel,
  type BusinessCostModel,
} from "@/lib/business-cost-model";
import {
  BUSINESS_COUNTRY_PRIORITY_TIERS,
  BUSINESS_COUNTRY_SCALE_OVERRIDES,
  BUSINESS_COUNTRY_SERVICEABILITY,
  BUSINESS_ISSUE_STATUSES,
  BUSINESS_PROMO_SEVERITIES,
  BUSINESS_PROMO_TYPES,
  BUSINESS_RISK_POSTURES,
  BUSINESS_STOCK_PRESSURE_STATUSES,
  createEmptyBusinessCommercialTruthSnapshot,
  createEmptyOperatingConstraints,
  createEmptyTargetPack,
  type BusinessCommercialSectionMeta,
  type BusinessCommercialTruthSnapshot,
  type BusinessCountryEconomicsRow,
  type BusinessOperatingConstraints,
  type BusinessPromoCalendarEvent,
  type BusinessTargetPackData,
} from "@/src/types/business-commercial";

const COMMERCIAL_TRUTH_TABLES = [
  "business_target_packs",
  "business_country_economics",
  "business_promo_calendar_events",
  "business_operating_constraints",
];

type MetaRow = {
  source_label: string | null;
  updated_at: string | null;
  updated_by_user_id: string | null;
};

type SnapshotMetaRow = {
  sourceLabel: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type TargetPackRow = {
  target_cpa: number | null;
  target_roas: number | null;
  break_even_cpa: number | null;
  break_even_roas: number | null;
  contribution_margin_assumption: number | null;
  aov_assumption: number | null;
  new_customer_weight: number | null;
  default_risk_posture: string | null;
} & MetaRow;

type CountryEconomicsRow = {
  country_code: string;
  economics_multiplier: number | null;
  margin_modifier: number | null;
  serviceability: string | null;
  priority_tier: string | null;
  scale_override: string | null;
  notes: string | null;
} & MetaRow;

type PromoCalendarRow = {
  event_id: string;
  title: string;
  promo_type: string | null;
  severity: string | null;
  start_date: string;
  end_date: string;
  affected_scope: string | null;
  notes: string | null;
} & MetaRow;

type OperatingConstraintsRow = {
  site_issue_status: string | null;
  checkout_issue_status: string | null;
  conversion_tracking_issue_status: string | null;
  feed_issue_status: string | null;
  stock_pressure_status: string | null;
  landing_page_concern: string | null;
  merchandising_concern: string | null;
  manual_do_not_scale_reason: string | null;
} & MetaRow;

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}

function hasTargetPackValue(targetPack: BusinessTargetPackData | null | undefined) {
  if (!targetPack) return false;
  return [
    targetPack.targetCpa,
    targetPack.targetRoas,
    targetPack.breakEvenCpa,
    targetPack.breakEvenRoas,
    targetPack.contributionMarginAssumption,
    targetPack.aovAssumption,
    targetPack.newCustomerWeight,
  ].some((value) => value !== null);
}

function hasOperatingConstraintValue(
  constraints: BusinessOperatingConstraints | null | undefined,
) {
  if (!constraints) return false;
  return (
    constraints.siteIssueStatus !== "none" ||
    constraints.checkoutIssueStatus !== "none" ||
    constraints.conversionTrackingIssueStatus !== "none" ||
    constraints.feedIssueStatus !== "none" ||
    constraints.stockPressureStatus !== "healthy" ||
    Boolean(normalizeString(constraints.landingPageConcern)) ||
    Boolean(normalizeString(constraints.merchandisingConcern)) ||
    Boolean(normalizeString(constraints.manualDoNotScaleReason))
  );
}

function dedupeByKey<T>(rows: T[], getKey: (row: T) => string | null) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

function readMetaValue(
  row: MetaRow | SnapshotMetaRow,
  key: "sourceLabel" | "updatedAt" | "updatedByUserId",
) {
  if ("source_label" in row) {
    if (key === "sourceLabel") return row.source_label;
    if (key === "updatedAt") return row.updated_at;
    return row.updated_by_user_id;
  }
  if (key === "sourceLabel") return row.sourceLabel;
  if (key === "updatedAt") return row.updatedAt;
  return row.updatedByUserId;
}

function buildSectionMeta(
  rows: Array<MetaRow | SnapshotMetaRow | null | undefined>,
): BusinessCommercialSectionMeta {
  const validRows = rows.filter(
    (row): row is MetaRow | SnapshotMetaRow => Boolean(row),
  );
  if (validRows.length === 0) {
    return {
      configured: false,
      itemCount: 0,
      sourceLabel: null,
      updatedAt: null,
      updatedByUserId: null,
    };
  }

  const latest = [...validRows].sort((left, right) =>
    String(readMetaValue(right, "updatedAt") ?? "").localeCompare(
      String(readMetaValue(left, "updatedAt") ?? ""),
    )
  )[0];
  const uniqueSources = Array.from(
    new Set(
      validRows
        .map((row) => readMetaValue(row, "sourceLabel"))
        .filter((value): value is string => Boolean(value)),
    )
  );

  return {
    configured: true,
    itemCount: validRows.length,
    sourceLabel:
      uniqueSources.length === 0
        ? (readMetaValue(latest, "sourceLabel") ?? null)
        : uniqueSources.length === 1
          ? uniqueSources[0]
          : "mixed_sources",
    updatedAt: readMetaValue(latest, "updatedAt") ?? null,
    updatedByUserId: readMetaValue(latest, "updatedByUserId") ?? null,
  };
}

function mapTargetPackRow(
  row: TargetPackRow | undefined,
): BusinessTargetPackData | null {
  if (!row) return null;
  return {
    targetCpa: normalizeNumber(row.target_cpa),
    targetRoas: normalizeNumber(row.target_roas),
    breakEvenCpa: normalizeNumber(row.break_even_cpa),
    breakEvenRoas: normalizeNumber(row.break_even_roas),
    contributionMarginAssumption: normalizeNumber(row.contribution_margin_assumption),
    aovAssumption: normalizeNumber(row.aov_assumption),
    newCustomerWeight: normalizeNumber(row.new_customer_weight),
    defaultRiskPosture: normalizeEnum(
      row.default_risk_posture,
      BUSINESS_RISK_POSTURES,
      "balanced",
    ),
    sourceLabel: normalizeString(row.source_label),
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

function mapCountryEconomicsRow(
  row: CountryEconomicsRow,
): BusinessCountryEconomicsRow {
  return {
    countryCode: String(row.country_code ?? "").toUpperCase(),
    economicsMultiplier: normalizeNumber(row.economics_multiplier),
    marginModifier: normalizeNumber(row.margin_modifier),
    serviceability: normalizeEnum(
      row.serviceability,
      BUSINESS_COUNTRY_SERVICEABILITY,
      "full",
    ),
    priorityTier: normalizeEnum(
      row.priority_tier,
      BUSINESS_COUNTRY_PRIORITY_TIERS,
      "tier_2",
    ),
    scaleOverride: normalizeEnum(
      row.scale_override,
      BUSINESS_COUNTRY_SCALE_OVERRIDES,
      "default",
    ),
    notes: normalizeString(row.notes),
    sourceLabel: normalizeString(row.source_label),
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

function mapPromoRow(
  row: PromoCalendarRow,
): BusinessPromoCalendarEvent {
  return {
    eventId: String(row.event_id ?? ""),
    title: String(row.title ?? ""),
    promoType: normalizeEnum(row.promo_type, BUSINESS_PROMO_TYPES, "sale"),
    severity: normalizeEnum(row.severity, BUSINESS_PROMO_SEVERITIES, "medium"),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    affectedScope: normalizeString(row.affected_scope),
    notes: normalizeString(row.notes),
    sourceLabel: normalizeString(row.source_label),
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

function mapConstraintsRow(
  row: OperatingConstraintsRow | undefined,
): BusinessOperatingConstraints | null {
  if (!row) return null;
  return {
    siteIssueStatus: normalizeEnum(row.site_issue_status, BUSINESS_ISSUE_STATUSES, "none"),
    checkoutIssueStatus: normalizeEnum(
      row.checkout_issue_status,
      BUSINESS_ISSUE_STATUSES,
      "none",
    ),
    conversionTrackingIssueStatus: normalizeEnum(
      row.conversion_tracking_issue_status,
      BUSINESS_ISSUE_STATUSES,
      "none",
    ),
    feedIssueStatus: normalizeEnum(row.feed_issue_status, BUSINESS_ISSUE_STATUSES, "none"),
    stockPressureStatus: normalizeEnum(
      row.stock_pressure_status,
      BUSINESS_STOCK_PRESSURE_STATUSES,
      "healthy",
    ),
    landingPageConcern: normalizeString(row.landing_page_concern),
    merchandisingConcern: normalizeString(row.merchandising_concern),
    manualDoNotScaleReason: normalizeString(row.manual_do_not_scale_reason),
    sourceLabel: normalizeString(row.source_label),
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

function mapCostModelContext(
  row: BusinessCostModel | null,
): BusinessCommercialTruthSnapshot["costModelContext"] {
  if (!row) return null;
  return {
    cogsPercent: row.cogsPercent,
    shippingPercent: row.shippingPercent,
    feePercent: row.feePercent,
    fixedCost: row.fixedCost,
    updatedAt: row.updatedAt,
  };
}

export function sanitizeBusinessCommercialTruthInput(
  businessId: string,
  input: Partial<BusinessCommercialTruthSnapshot> | null | undefined,
) {
  const targetPackInput = input?.targetPack;
  const targetPack = targetPackInput
    ? {
        ...createEmptyTargetPack(),
        targetCpa: normalizeNumber(targetPackInput.targetCpa),
        targetRoas: normalizeNumber(targetPackInput.targetRoas),
        breakEvenCpa: normalizeNumber(targetPackInput.breakEvenCpa),
        breakEvenRoas: normalizeNumber(targetPackInput.breakEvenRoas),
        contributionMarginAssumption: normalizeNumber(
          targetPackInput.contributionMarginAssumption,
        ),
        aovAssumption: normalizeNumber(targetPackInput.aovAssumption),
        newCustomerWeight: normalizeNumber(targetPackInput.newCustomerWeight),
        defaultRiskPosture: normalizeEnum(
          targetPackInput.defaultRiskPosture,
          BUSINESS_RISK_POSTURES,
          "balanced",
        ),
        sourceLabel: normalizeString(targetPackInput.sourceLabel) ?? "settings_manual_entry",
      }
    : null;

  const countryEconomics = dedupeByKey(
    (input?.countryEconomics ?? [])
      .map((row) => ({
        countryCode: normalizeString(row.countryCode)?.toUpperCase() ?? "",
        economicsMultiplier: normalizeNumber(row.economicsMultiplier),
        marginModifier: normalizeNumber(row.marginModifier),
        serviceability: normalizeEnum(
          row.serviceability,
          BUSINESS_COUNTRY_SERVICEABILITY,
          "full",
        ),
        priorityTier: normalizeEnum(
          row.priorityTier,
          BUSINESS_COUNTRY_PRIORITY_TIERS,
          "tier_2",
        ),
        scaleOverride: normalizeEnum(
          row.scaleOverride,
          BUSINESS_COUNTRY_SCALE_OVERRIDES,
          "default",
        ),
        notes: normalizeString(row.notes),
        sourceLabel: normalizeString(row.sourceLabel) ?? "settings_manual_entry",
      }))
      .filter((row) => row.countryCode.length > 0),
    (row) => row.countryCode,
  );

  const promoCalendar = dedupeByKey(
    (input?.promoCalendar ?? [])
      .map((row, index) => {
        const startDate = normalizeDate(row.startDate);
        const endDate = normalizeDate(row.endDate);
        if (!startDate || !endDate) {
          return null;
        }
        return {
          eventId:
            normalizeString(row.eventId) ??
            `promo_${index + 1}_${startDate.replaceAll("-", "")}`,
          title: normalizeString(row.title) ?? "",
          promoType: normalizeEnum(row.promoType, BUSINESS_PROMO_TYPES, "sale"),
          severity: normalizeEnum(row.severity, BUSINESS_PROMO_SEVERITIES, "medium"),
          startDate,
          endDate,
          affectedScope: normalizeString(row.affectedScope),
          notes: normalizeString(row.notes),
          sourceLabel: normalizeString(row.sourceLabel) ?? "settings_manual_entry",
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => row.title.length > 0)
      .filter((row) => row.endDate >= row.startDate),
    (row) => row.eventId,
  );

  const constraintsInput = input?.operatingConstraints;
  const operatingConstraints = constraintsInput
    ? {
        ...createEmptyOperatingConstraints(),
        siteIssueStatus: normalizeEnum(
          constraintsInput.siteIssueStatus,
          BUSINESS_ISSUE_STATUSES,
          "none",
        ),
        checkoutIssueStatus: normalizeEnum(
          constraintsInput.checkoutIssueStatus,
          BUSINESS_ISSUE_STATUSES,
          "none",
        ),
        conversionTrackingIssueStatus: normalizeEnum(
          constraintsInput.conversionTrackingIssueStatus,
          BUSINESS_ISSUE_STATUSES,
          "none",
        ),
        feedIssueStatus: normalizeEnum(
          constraintsInput.feedIssueStatus,
          BUSINESS_ISSUE_STATUSES,
          "none",
        ),
        stockPressureStatus: normalizeEnum(
          constraintsInput.stockPressureStatus,
          BUSINESS_STOCK_PRESSURE_STATUSES,
          "healthy",
        ),
        landingPageConcern: normalizeString(constraintsInput.landingPageConcern),
        merchandisingConcern: normalizeString(constraintsInput.merchandisingConcern),
        manualDoNotScaleReason: normalizeString(
          constraintsInput.manualDoNotScaleReason,
        ),
        sourceLabel:
          normalizeString(constraintsInput.sourceLabel) ?? "settings_manual_entry",
      }
    : null;

  return {
    businessId,
    targetPack: hasTargetPackValue(targetPack) ? targetPack : null,
    countryEconomics,
    promoCalendar,
    operatingConstraints: hasOperatingConstraintValue(operatingConstraints)
      ? operatingConstraints
      : null,
  };
}

export async function getBusinessCommercialTruthSnapshot(
  businessId: string,
): Promise<BusinessCommercialTruthSnapshot> {
  try {
    const readiness = await getDbSchemaReadiness({
      tables: COMMERCIAL_TRUTH_TABLES,
    });
    const emptySnapshot = createEmptyBusinessCommercialTruthSnapshot(businessId);

    if (!readiness.ready) {
      return {
        ...emptySnapshot,
        costModelContext: mapCostModelContext(
          await getBusinessCostModel(businessId).catch(() => null),
        ),
      };
    }

    const sql = getDb();
    const [targetRows, countryRows, promoRows, constraintRows] = await Promise.all([
      sql`
        SELECT
          target_cpa,
          target_roas,
          break_even_cpa,
          break_even_roas,
          contribution_margin_assumption,
          aov_assumption,
          new_customer_weight,
          default_risk_posture,
          source_label,
          updated_at,
          updated_by_user_id
        FROM business_target_packs
        WHERE business_id = ${businessId}
        LIMIT 1
      `,
      sql`
        SELECT
          country_code,
          economics_multiplier,
          margin_modifier,
          serviceability,
          priority_tier,
          scale_override,
          notes,
          source_label,
          updated_at,
          updated_by_user_id
        FROM business_country_economics
        WHERE business_id = ${businessId}
        ORDER BY priority_tier ASC, country_code ASC
      `,
      sql`
        SELECT
          event_id,
          title,
          promo_type,
          severity,
          start_date::text AS start_date,
          end_date::text AS end_date,
          affected_scope,
          notes,
          source_label,
          updated_at,
          updated_by_user_id
        FROM business_promo_calendar_events
        WHERE business_id = ${businessId}
        ORDER BY start_date ASC, end_date ASC, title ASC
      `,
      sql`
        SELECT
          site_issue_status,
          checkout_issue_status,
          conversion_tracking_issue_status,
          feed_issue_status,
          stock_pressure_status,
          landing_page_concern,
          merchandising_concern,
          manual_do_not_scale_reason,
          source_label,
          updated_at,
          updated_by_user_id
        FROM business_operating_constraints
        WHERE business_id = ${businessId}
        LIMIT 1
      `,
    ]);

    const targetPack = mapTargetPackRow((targetRows as TargetPackRow[])[0]);
    const countryEconomics = (countryRows as CountryEconomicsRow[]).map(
      mapCountryEconomicsRow,
    );
    const promoCalendar = (promoRows as PromoCalendarRow[]).map(mapPromoRow);
    const operatingConstraints = mapConstraintsRow(
      (constraintRows as OperatingConstraintsRow[])[0],
    );
    const costModelContext = mapCostModelContext(
      await getBusinessCostModel(businessId).catch(() => null),
    );

    return {
      businessId,
      targetPack,
      countryEconomics,
      promoCalendar,
      operatingConstraints,
      costModelContext,
      sectionMeta: {
        targetPack: buildSectionMeta(targetPack ? [targetPack] : []),
        countryEconomics: buildSectionMeta(countryEconomics),
        promoCalendar: buildSectionMeta(promoCalendar),
        operatingConstraints: buildSectionMeta(
          operatingConstraints ? [operatingConstraints] : [],
        ),
      },
    };
  } catch (error) {
    if (isMissingRelationError(error, COMMERCIAL_TRUTH_TABLES)) {
      return {
        ...createEmptyBusinessCommercialTruthSnapshot(businessId),
        costModelContext: mapCostModelContext(
          await getBusinessCostModel(businessId).catch(() => null),
        ),
      };
    }
    throw error;
  }
}

export async function upsertBusinessCommercialTruthSnapshot(input: {
  businessId: string;
  updatedByUserId: string | null;
  snapshot: Partial<BusinessCommercialTruthSnapshot> | null | undefined;
}) {
  await assertDbSchemaReady({
    tables: COMMERCIAL_TRUTH_TABLES,
    context: "business_commercial_truth_upsert",
  });

  const sanitized = sanitizeBusinessCommercialTruthInput(input.businessId, input.snapshot);
  const sql = getDb();

  if (sanitized.targetPack) {
    await sql`
      INSERT INTO business_target_packs (
        business_id,
        target_cpa,
        target_roas,
        break_even_cpa,
        break_even_roas,
        contribution_margin_assumption,
        aov_assumption,
        new_customer_weight,
        default_risk_posture,
        source_label,
        updated_by_user_id,
        updated_at
      )
      VALUES (
        ${sanitized.businessId},
        ${sanitized.targetPack.targetCpa},
        ${sanitized.targetPack.targetRoas},
        ${sanitized.targetPack.breakEvenCpa},
        ${sanitized.targetPack.breakEvenRoas},
        ${sanitized.targetPack.contributionMarginAssumption},
        ${sanitized.targetPack.aovAssumption},
        ${sanitized.targetPack.newCustomerWeight},
        ${sanitized.targetPack.defaultRiskPosture},
        ${sanitized.targetPack.sourceLabel},
        ${input.updatedByUserId},
        now()
      )
      ON CONFLICT (business_id)
      DO UPDATE SET
        target_cpa = EXCLUDED.target_cpa,
        target_roas = EXCLUDED.target_roas,
        break_even_cpa = EXCLUDED.break_even_cpa,
        break_even_roas = EXCLUDED.break_even_roas,
        contribution_margin_assumption = EXCLUDED.contribution_margin_assumption,
        aov_assumption = EXCLUDED.aov_assumption,
        new_customer_weight = EXCLUDED.new_customer_weight,
        default_risk_posture = EXCLUDED.default_risk_posture,
        source_label = EXCLUDED.source_label,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
    `;
  } else {
    await sql`DELETE FROM business_target_packs WHERE business_id = ${sanitized.businessId}`;
  }

  await sql`DELETE FROM business_country_economics WHERE business_id = ${sanitized.businessId}`;
  for (const row of sanitized.countryEconomics) {
    await sql`
      INSERT INTO business_country_economics (
        business_id,
        country_code,
        economics_multiplier,
        margin_modifier,
        serviceability,
        priority_tier,
        scale_override,
        notes,
        source_label,
        updated_by_user_id,
        updated_at
      )
      VALUES (
        ${sanitized.businessId},
        ${row.countryCode},
        ${row.economicsMultiplier},
        ${row.marginModifier},
        ${row.serviceability},
        ${row.priorityTier},
        ${row.scaleOverride},
        ${row.notes},
        ${row.sourceLabel},
        ${input.updatedByUserId},
        now()
      )
    `;
  }

  await sql`DELETE FROM business_promo_calendar_events WHERE business_id = ${sanitized.businessId}`;
  for (const row of sanitized.promoCalendar) {
    await sql`
      INSERT INTO business_promo_calendar_events (
        business_id,
        event_id,
        title,
        promo_type,
        severity,
        start_date,
        end_date,
        affected_scope,
        notes,
        source_label,
        updated_by_user_id,
        updated_at
      )
      VALUES (
        ${sanitized.businessId},
        ${row.eventId},
        ${row.title},
        ${row.promoType},
        ${row.severity},
        ${row.startDate},
        ${row.endDate},
        ${row.affectedScope},
        ${row.notes},
        ${row.sourceLabel},
        ${input.updatedByUserId},
        now()
      )
    `;
  }

  if (sanitized.operatingConstraints) {
    await sql`
      INSERT INTO business_operating_constraints (
        business_id,
        site_issue_status,
        checkout_issue_status,
        conversion_tracking_issue_status,
        feed_issue_status,
        stock_pressure_status,
        landing_page_concern,
        merchandising_concern,
        manual_do_not_scale_reason,
        source_label,
        updated_by_user_id,
        updated_at
      )
      VALUES (
        ${sanitized.businessId},
        ${sanitized.operatingConstraints.siteIssueStatus},
        ${sanitized.operatingConstraints.checkoutIssueStatus},
        ${sanitized.operatingConstraints.conversionTrackingIssueStatus},
        ${sanitized.operatingConstraints.feedIssueStatus},
        ${sanitized.operatingConstraints.stockPressureStatus},
        ${sanitized.operatingConstraints.landingPageConcern},
        ${sanitized.operatingConstraints.merchandisingConcern},
        ${sanitized.operatingConstraints.manualDoNotScaleReason},
        ${sanitized.operatingConstraints.sourceLabel},
        ${input.updatedByUserId},
        now()
      )
      ON CONFLICT (business_id)
      DO UPDATE SET
        site_issue_status = EXCLUDED.site_issue_status,
        checkout_issue_status = EXCLUDED.checkout_issue_status,
        conversion_tracking_issue_status = EXCLUDED.conversion_tracking_issue_status,
        feed_issue_status = EXCLUDED.feed_issue_status,
        stock_pressure_status = EXCLUDED.stock_pressure_status,
        landing_page_concern = EXCLUDED.landing_page_concern,
        merchandising_concern = EXCLUDED.merchandising_concern,
        manual_do_not_scale_reason = EXCLUDED.manual_do_not_scale_reason,
        source_label = EXCLUDED.source_label,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
    `;
  } else {
    await sql`
      DELETE FROM business_operating_constraints
      WHERE business_id = ${sanitized.businessId}
    `;
  }

  return getBusinessCommercialTruthSnapshot(input.businessId);
}
