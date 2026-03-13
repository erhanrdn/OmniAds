"use client";

import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  SectionLabel, QuadrantBadge, computeQuadrant,
  SpendBar,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

export interface ProductRow {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpa: number;
  ctr: number;
  // Shopify-enriched (optional)
  price?: number;
  margin?: number;
  inventory?: number;
  profitProxy?: number;
}

interface ProductIntelligenceTabProps {
  products?: ProductRow[];
  totalSpend?: number;
  isLoading: boolean;
  unavailable?: boolean;
  unavailableReason?: string;
}

// ── Concentration risk ─────────────────────────────────────────────────

function ConcentrationRisk({ products, totalSpend }: { products: ProductRow[]; totalSpend: number }) {
  if (products.length < 3 || totalSpend === 0) return null;

  const sorted = [...products].sort((a, b) => b.spend - a.spend);
  const top1Pct = totalSpend > 0 ? (sorted[0].spend / totalSpend) * 100 : 0;
  const top3Spend = sorted.slice(0, 3).reduce((s, p) => s + p.spend, 0);
  const top3Pct = totalSpend > 0 ? (top3Spend / totalSpend) * 100 : 0;

  const risks: string[] = [];
  if (top1Pct > 50) risks.push(`${sorted[0].title} absorbs ${top1Pct.toFixed(0)}% of product spend — high concentration risk.`);
  if (top3Pct > 80) risks.push(`Top 3 products consume ${top3Pct.toFixed(0)}% of spend — consider diversifying budget.`);

  if (risks.length === 0) return null;

  return (
    <div className="space-y-2">
      {risks.map((r, i) => (
        <div key={i} className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <p className="text-xs text-amber-900 dark:text-amber-100">⚠ {r}</p>
        </div>
      ))}
    </div>
  );
}

// ── Scale & waste highlights ───────────────────────────────────────────

function ProductHighlights({ products, avgRoas, medianSpend }: { products: ProductRow[]; avgRoas: number; medianSpend: number }) {
  const scaleProducts = products.filter((p) => computeQuadrant(p.roas, p.spend, avgRoas, medianSpend) === "Test" && p.roas >= avgRoas);
  const wasteProducts = products.filter((p) => p.spend > 20 && p.conversions === 0 && p.clicks >= 10);

  if (scaleProducts.length === 0 && wasteProducts.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {scaleProducts.length > 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
            {scaleProducts.length} product{scaleProducts.length > 1 ? "s" : ""} ready to scale
          </p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5 mb-3">
            Strong ROAS with low spend — increase budget allocation to grow returns.
          </p>
          <div className="space-y-1">
            {scaleProducts.slice(0, 4).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate text-emerald-900 dark:text-emerald-100 max-w-[160px]" title={p.title}>{p.title}</span>
                <span className="text-emerald-700 dark:text-emerald-300 shrink-0 ml-2">{fmtRoas(p.roas)} ROAS</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {wasteProducts.length > 0 && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4">
          <p className="text-xs font-semibold text-rose-900 dark:text-rose-100">
            {wasteProducts.length} product{wasteProducts.length > 1 ? "s" : ""} spending without converting
          </p>
          <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5 mb-3">
            Meaningful clicks but zero conversions — review landing pages or pause spend.
          </p>
          <div className="space-y-1">
            {wasteProducts.slice(0, 4).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate text-rose-900 dark:text-rose-100 max-w-[160px]" title={p.title}>{p.title}</span>
                <span className="text-rose-700 dark:text-rose-300 shrink-0 ml-2">{fmtCurrency(p.spend)} spent</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Spend allocation bar chart ─────────────────────────────────────────

function SpendAllocation({ products, totalSpend }: { products: ProductRow[]; totalSpend: number }) {
  const top = [...products].sort((a, b) => b.spend - a.spend).slice(0, 10);
  const otherSpend = totalSpend - top.reduce((s, p) => s + p.spend, 0);

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold mb-3">Spend Allocation by Product</p>
      <div className="space-y-2">
        {top.map((p, i) => {
          const pct = totalSpend > 0 ? ((p.spend / totalSpend) * 100).toFixed(1) : "0.0";
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs truncate max-w-[180px]" title={p.title}>{p.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0 ml-2">{pct}%</span>
                </div>
                <SpendBar value={p.spend} max={totalSpend} />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-14 text-right">{fmtCurrency(p.spend)}</span>
            </div>
          );
        })}
        {otherSpend > 0 && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-muted-foreground">All other products</span>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0 ml-2">{totalSpend > 0 ? ((otherSpend / totalSpend) * 100).toFixed(1) : "0.0"}%</span>
              </div>
              <SpendBar value={otherSpend} max={totalSpend} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-14 text-right">{fmtCurrency(otherSpend)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Unavailable state ──────────────────────────────────────────────────

function ProductUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center space-y-3 px-6">
      <div className="text-3xl">🛍️</div>
      <p className="text-sm font-semibold">Product Intelligence not available</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        {reason ?? "Product-level reporting requires Shopping campaigns or Performance Max campaigns with product feeds. Connect Shopping or set up product feeds to unlock product intelligence."}
      </p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-muted/30 px-4 py-3 max-w-sm mx-auto text-left mt-4">
        <p className="text-xs font-medium mb-1">What enables product intelligence:</p>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Google Shopping campaigns</li>
          <li>Performance Max with product feeds</li>
          <li>Shopify integration (for margin & inventory data)</li>
        </ul>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function ProductIntelligenceTab({
  products,
  totalSpend,
  isLoading,
  unavailable,
  unavailableReason,
}: ProductIntelligenceTabProps) {
  if (isLoading) return <TabSkeleton rows={6} />;

  if (unavailable || !products || products.length === 0) {
    return <ProductUnavailable reason={unavailableReason} />;
  }

  const spend = totalSpend ?? products.reduce((s, p) => s + p.spend, 0);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const avgRoas = spend > 0 ? totalRevenue / spend : 0;
  const sorted = [...products].sort((a, b) => b.spend - a.spend);
  const medianSpend = sorted[Math.floor(sorted.length / 2)]?.spend ?? 0;

  const hasProfitProxy = products.some((p) => typeof p.profitProxy === "number");

  const cols: ColDef<ProductRow>[] = [
    {
      key: "title", header: "Product", accessor: (r) => r.title,
      render: (r) => (
        <div className="max-w-[200px]">
          <p className="text-xs font-medium truncate" title={r.title}>{r.title}</p>
          {r.brand && <p className="text-[10px] text-muted-foreground">{r.brand}</p>}
          {r.inventory !== undefined && r.inventory < 10 && (
            <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold">
              Low stock
            </span>
          )}
        </div>
      ),
    },
    {
      key: "quadrant", header: "Status", accessor: (r) => r.roas,
      render: (r) => <QuadrantBadge label={computeQuadrant(r.roas, r.spend, avgRoas, medianSpend)} />,
      sortable: false,
    },
    {
      key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right",
      render: (r) => (
        <div className="text-right min-w-[60px]">
          <p className="text-xs tabular-nums">{fmtCurrency(r.spend)}</p>
          <SpendBar value={r.spend} max={spend} />
        </div>
      ),
    },
    { key: "revenue", header: "Revenue", accessor: (r) => r.revenue, align: "right", render: (r) => fmtCurrency(r.revenue) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => (
        <span className={cn("font-semibold", r.roas >= avgRoas * 1.2 ? "text-emerald-600 dark:text-emerald-400" : r.roas < avgRoas * 0.5 ? "text-rose-600 dark:text-rose-400" : "")}>
          {r.roas === 0 ? "—" : fmtRoas(r.roas)}
        </span>
      ),
    },
    { key: "conversions", header: "Orders", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    ...(hasProfitProxy ? [{
      key: "profitProxy",
      header: "Profit Proxy",
      accessor: (r: ProductRow) => r.profitProxy ?? 0,
      align: "right" as const,
      render: (r: ProductRow) => r.profitProxy !== undefined ? (
        <span className={cn("tabular-nums", r.profitProxy < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
          {fmtCurrency(r.profitProxy)}
        </span>
      ) : "—",
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionLabel>Product Intelligence</SectionLabel>

      {/* Account-level KPIs */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Products</p>
          <p className="text-2xl font-bold mt-1">{fmtNumber(products.length)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spend</p>
          <p className="text-2xl font-bold mt-1">{fmtCurrency(spend)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">{fmtCurrency(totalRevenue)}</p>
        </div>
        <div className={cn("rounded-xl border p-4", avgRoas >= 2 ? "border-emerald-200 dark:border-emerald-900/50" : avgRoas < 1 ? "border-rose-200 dark:border-rose-900/50" : "bg-card")}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg ROAS</p>
          <p className={cn("text-2xl font-bold mt-1", avgRoas >= 2 ? "text-emerald-600 dark:text-emerald-400" : avgRoas < 1 ? "text-rose-600 dark:text-rose-400" : "")}>
            {fmtRoas(avgRoas)}
          </p>
        </div>
      </div>

      {hasProfitProxy && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/30 px-4 py-3">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Profit proxy = Revenue − Spend. True profitability requires cost-of-goods data from Shopify. Connect Shopify for margin-aware analysis.
          </p>
        </div>
      )}

      <ConcentrationRisk products={products} totalSpend={spend} />
      <ProductHighlights products={products} avgRoas={avgRoas} medianSpend={medianSpend} />
      <SpendAllocation products={products} totalSpend={spend} />

      <div>
        <SectionLabel>Product Performance Table</SectionLabel>
        <div className="mt-3">
          <SimpleTable cols={cols} rows={products} defaultSort="spend" />
        </div>
      </div>
    </div>
  );
}
