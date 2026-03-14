import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsProducts,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";

const PRODUCT_DIMENSION = { name: "itemName" };
const PRODUCT_LIMIT = 100;

type ProductMetricKey =
  | "views"
  | "addToCarts"
  | "checkouts"
  | "purchases"
  | "revenue";

const METRIC_CANDIDATES: Record<ProductMetricKey, string[]> = {
  views: ["itemsViewed", "itemViews", "itemViewEvents"],
  addToCarts: ["itemsAddedToCart", "addToCarts"],
  checkouts: ["itemsCheckedOut", "checkouts"],
  purchases: ["itemsPurchased", "ecommercePurchases"],
  revenue: ["itemRevenue"],
};

function isGa4InvalidArgumentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("GA4 Reporting API error 400") &&
    error.message.includes("INVALID_ARGUMENT")
  );
}

async function fetchProductMetricSeries(params: {
  propertyId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  metricKey: ProductMetricKey;
}): Promise<{
  rowsByProduct: Map<string, number>;
  metricName: string | null;
  unavailable: boolean;
  unavailableReason: string | null;
}> {
  const metricCandidates = METRIC_CANDIDATES[params.metricKey];

  for (const metricName of metricCandidates) {
    try {
      const report = await runGA4Report({
        propertyId: params.propertyId,
        accessToken: params.accessToken,
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: [PRODUCT_DIMENSION],
        metrics: [{ name: metricName }],
        orderBys: [{ metric: { metricName }, desc: true }],
        limit: PRODUCT_LIMIT,
      });

      const rowsByProduct = new Map<string, number>();
      for (const row of report.rows) {
        const productName = (row.dimensions[0] ?? "").trim() || "(unknown)";
        const rawValue = Number.parseFloat(row.metrics[0] ?? "0");
        if (!Number.isFinite(rawValue)) continue;
        rowsByProduct.set(productName, (rowsByProduct.get(productName) ?? 0) + rawValue);
      }

      return {
        rowsByProduct,
        metricName,
        unavailable: false,
        unavailableReason: null,
      };
    } catch (error) {
      if (isGa4InvalidArgumentError(error)) {
        continue;
      }
      throw error;
    }
  }

  return {
    rowsByProduct: new Map<string, number>(),
    metricName: null,
    unavailable: true,
    unavailableReason: "metric_incompatible_or_unavailable",
  };
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? "30daysAgo";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "yesterday";

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoAnalyticsProducts());
  }

  const cached = await getCachedRouteReport<{
    rows: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    meta: Record<string, unknown>;
  }>({
    businessId,
    provider: "ga4",
    reportType: "ga4_detailed_products",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  let accessToken: string;
  let propertyId: string;
  try {
    ({ accessToken, propertyId } = await getGA4TokenAndProperty(businessId));
  } catch (err) {
    if (err instanceof GA4AuthError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          action: err.action,
          reconnectRequired: err.action === "reconnect_ga4",
        },
        { status: err.status }
      );
    }
    throw err;
  }

  try {
    const [viewsSeries, addToCartSeries, checkoutSeries, purchasesSeries, revenueSeries] =
      await Promise.all([
        fetchProductMetricSeries({
          propertyId,
          accessToken,
          startDate,
          endDate,
          metricKey: "views",
        }),
        fetchProductMetricSeries({
          propertyId,
          accessToken,
          startDate,
          endDate,
          metricKey: "addToCarts",
        }),
        fetchProductMetricSeries({
          propertyId,
          accessToken,
          startDate,
          endDate,
          metricKey: "checkouts",
        }),
        fetchProductMetricSeries({
          propertyId,
          accessToken,
          startDate,
          endDate,
          metricKey: "purchases",
        }),
        fetchProductMetricSeries({
          propertyId,
          accessToken,
          startDate,
          endDate,
          metricKey: "revenue",
        }),
      ]);

    const allNames = new Set<string>();
    for (const series of [
      viewsSeries.rowsByProduct,
      addToCartSeries.rowsByProduct,
      checkoutSeries.rowsByProduct,
      purchasesSeries.rowsByProduct,
      revenueSeries.rowsByProduct,
    ]) {
      for (const name of series.keys()) allNames.add(name);
    }

    const products = [...allNames]
      .map((name) => {
        const views = viewsSeries.rowsByProduct.get(name) ?? 0;
        const addToCarts = addToCartSeries.rowsByProduct.get(name) ?? 0;
        const checkouts = checkoutSeries.rowsByProduct.get(name) ?? 0;
        const purchases = purchasesSeries.rowsByProduct.get(name) ?? 0;
        const revenue = revenueSeries.rowsByProduct.get(name) ?? 0;

        return {
          name,
          views,
          addToCarts,
          checkouts,
          purchases,
          revenue,
          atcRate: views > 0 ? addToCarts / views : 0,
          checkoutRate: addToCarts > 0 ? checkouts / addToCarts : 0,
          purchaseRate: checkouts > 0 ? purchases / checkouts : 0,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, PRODUCT_LIMIT);

    const hasEcommerceData = products.some(
      (row) =>
        row.views > 0 ||
        row.addToCarts > 0 ||
        row.checkouts > 0 ||
        row.purchases > 0 ||
        row.revenue > 0
    );

    const unavailableMetrics = (
      [
        ["views", viewsSeries] as const,
        ["addToCarts", addToCartSeries] as const,
        ["checkouts", checkoutSeries] as const,
        ["purchases", purchasesSeries] as const,
        ["revenue", revenueSeries] as const,
      ] satisfies ReadonlyArray<
        readonly [ProductMetricKey, { unavailable: boolean; unavailableReason: string | null }]
      >
    )
      .filter(([, result]) => result.unavailable)
      .map(([metricKey, result]) => ({
        metric: metricKey,
        reason: result.unavailableReason,
      }));

    const meta = {
      empty: products.length === 0,
      has_ecommerce_data: hasEcommerceData,
      reason: hasEcommerceData ? null : "no_product_events",
      metric_resolution: {
        views: viewsSeries.metricName,
        addToCarts: addToCartSeries.metricName,
        checkouts: checkoutSeries.metricName,
        purchases: purchasesSeries.metricName,
        revenue: revenueSeries.metricName,
      },
      unavailable_metrics: unavailableMetrics,
    };

    const payload = {
      rows: products.map((row) => ({
        product: row.name,
        views: row.views,
        addToCart: row.addToCarts,
        checkouts: row.checkouts,
        purchases: row.purchases,
        revenue: row.revenue,
        addToCartRate: row.atcRate,
        checkoutRate: row.checkoutRate,
        purchaseRate: row.purchaseRate,
      })),
      products,
      meta,
    };
    await setCachedRouteReport({
      businessId,
      provider: "ga4",
      reportType: "ga4_detailed_products",
      searchParams: request.nextUrl.searchParams,
      payload,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load product funnel data.";
    return NextResponse.json(
      {
        error: "products_report_failed",
        message,
        action: "retry_later",
      },
      { status: 502 }
    );
  }
}
