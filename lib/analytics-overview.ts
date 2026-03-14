import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoAnalyticsOverview } from "@/lib/demo-business";
import {
  GA4AuthError,
  generateInsights,
  getGA4TokenAndProperty,
  runGA4Report,
} from "@/lib/google-analytics-reporting";

export interface AnalyticsOverviewResponse {
  propertyName?: string;
  kpis?: {
    sessions?: number;
    engagedSessions?: number;
    engagementRate?: number;
    purchases?: number;
    purchaseCvr?: number;
    revenue?: number;
    avgSessionDuration?: number;
  };
  newVsReturning?: {
    new: {
      sessions: number;
      purchases: number;
      purchaseCvr: number;
    };
    returning: {
      sessions: number;
      purchases: number;
      purchaseCvr: number;
    };
  };
  insights?: Array<{ type: string; text: string }>;
}

export async function getAnalyticsOverviewData(params: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<AnalyticsOverviewResponse> {
  const { businessId } = params;
  const startDate = params.startDate ?? "30daysAgo";
  const endDate = params.endDate ?? "yesterday";

  if (await isDemoBusiness(businessId)) {
    return getDemoAnalyticsOverview();
  }

  let accessToken: string;
  let propertyId: string;
  let propertyName: string;
  ({ accessToken, propertyId, propertyName } =
    await getGA4TokenAndProperty(businessId));

  const dateRanges = [{ startDate, endDate }];

  const [overviewReport, newVsReturningReport] = await Promise.all([
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "averageSessionDuration" },
      ],
    }),
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      dimensions: [{ name: "newVsReturning" }],
      metrics: [
        { name: "sessions" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "engagementRate" },
      ],
      limit: 5,
    }),
  ]);

  const totalsRow = overviewReport.totals?.[0] ?? overviewReport.rows[0];
  const sessions = parseFloat(totalsRow?.metrics[0] ?? "0");
  const engagedSessions = parseFloat(totalsRow?.metrics[1] ?? "0");
  const engagementRate = parseFloat(totalsRow?.metrics[2] ?? "0");
  const purchases = parseFloat(totalsRow?.metrics[3] ?? "0");
  const revenue = parseFloat(totalsRow?.metrics[4] ?? "0");
  const avgSessionDuration = parseFloat(totalsRow?.metrics[5] ?? "0");
  const purchaseCvr = sessions > 0 ? purchases / sessions : 0;

  let newSessions = 0;
  let newPurchases = 0;
  let returningSessions = 0;
  let returningPurchases = 0;
  for (const row of newVsReturningReport.rows) {
    const type = row.dimensions[0];
    const s = parseFloat(row.metrics[0] ?? "0");
    const p = parseFloat(row.metrics[1] ?? "0");
    if (type === "new") {
      newSessions = s;
      newPurchases = p;
    } else if (type === "returning") {
      returningSessions = s;
      returningPurchases = p;
    }
  }

  const insights = generateInsights({
    overview: { sessions, engagedSessions, purchases, revenue },
    audience: { newSessions, newPurchases, returningSessions, returningPurchases },
  });

  return {
    propertyName,
    kpis: {
      sessions,
      engagedSessions,
      engagementRate,
      purchases,
      purchaseCvr,
      revenue,
      avgSessionDuration,
    },
    newVsReturning: {
      new: {
        sessions: newSessions,
        purchases: newPurchases,
        purchaseCvr: newSessions > 0 ? newPurchases / newSessions : 0,
      },
      returning: {
        sessions: returningSessions,
        purchases: returningPurchases,
        purchaseCvr:
          returningSessions > 0 ? returningPurchases / returningSessions : 0,
      },
    },
    insights,
  };
}

export { GA4AuthError };
