"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUSINESS_COUNTRY_PRIORITY_TIERS,
  BUSINESS_COUNTRY_SCALE_OVERRIDES,
  BUSINESS_COUNTRY_SERVICEABILITY,
  BUSINESS_ISSUE_STATUSES,
  BUSINESS_PROMO_SEVERITIES,
  BUSINESS_PROMO_TYPES,
  BUSINESS_STOCK_PRESSURE_STATUSES,
  createEmptyBusinessCommercialTruthSnapshot,
  createEmptyCountryEconomicsRow,
  createEmptyOperatingConstraints,
  createEmptyPromoCalendarEvent,
  createEmptyTargetPack,
  type BusinessCommercialTruthSnapshot,
} from "@/src/types/business-commercial";

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface CommercialTruthSettingsResponse {
  snapshot: BusinessCommercialTruthSnapshot;
  permissions: {
    canEdit: boolean;
    reason: string | null;
    role: "admin" | "collaborator" | "guest";
  };
}

// ---------------------------------------------------------------------------
// Design primitives
// ---------------------------------------------------------------------------

function CtSection({
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {eyebrow}
            </p>
          )}
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-[12.5px] leading-snug text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function CtField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12.5px] font-semibold text-slate-900">{label}</label>
      {children}
      {helper && (
        <p className="text-[11.5px] leading-snug text-slate-500">{helper}</p>
      )}
    </div>
  );
}

function CtNumberInput({
  value,
  onChange,
  suffix,
  prefix,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  prefix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-10 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3">
      {prefix && <span className="text-[13px] text-slate-400">{prefix}</span>}
      <input
        type="number"
        step="0.01"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-slate-900 tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      {suffix && <span className="text-[13px] text-slate-500">{suffix}</span>}
    </div>
  );
}

function CtSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full appearance-none rounded-[10px] border border-slate-200 bg-white pl-3 pr-9 text-[13px] font-medium text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      >
        <path
          d="M2.5 4l2.5 2.5L7.5 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function CtTextInput({
  value,
  onChange,
  placeholder,
  multiline,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const baseClass =
    "w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-60";
  return multiline ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      disabled={disabled}
      className={`${baseClass} resize-y`}
    />
  ) : (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`${baseClass} h-10`}
    />
  );
}

function CtStatCard({
  label,
  value,
  helper,
  dominant,
}: {
  label: string;
  value: string;
  helper: string;
  dominant?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-2xl p-[18px] ${
        dominant
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-slate-50 text-slate-900"
      }`}
    >
      <p
        className={`text-[10.5px] font-semibold uppercase tracking-[0.14em] ${
          dominant ? "text-white/70" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`tabular-nums leading-none tracking-[-0.025em] ${
          dominant ? "text-[38px] font-bold text-white" : "text-[26px] font-bold text-slate-900"
        }`}
      >
        {value}
      </p>
      <p
        className={`text-[11.5px] leading-snug ${
          dominant ? "text-white/65" : "text-slate-500"
        }`}
      >
        {helper}
      </p>
    </div>
  );
}

function CtGhostBtn({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CtIconCircleBtn({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CtEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-3.5 text-[12.5px] leading-snug text-slate-500">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Decision Coverage
// ---------------------------------------------------------------------------

const COVERAGE_TONE = {
  complete: { dot: "bg-emerald-500", ring: "shadow-[0_0_0_3px_rgb(16,185,129,0.13)]", badge: "bg-emerald-50 text-emerald-700", label: "Complete" },
  optional: { dot: "bg-slate-400", ring: "shadow-[0_0_0_3px_rgb(148,163,184,0.13)]", badge: "bg-slate-100 text-slate-600", label: "Optional" },
  missing:  { dot: "bg-amber-400", ring: "shadow-[0_0_0_3px_rgb(245,158,11,0.13)]", badge: "bg-amber-50 text-amber-700", label: "Missing" },
  blocking: { dot: "bg-rose-500",  ring: "shadow-[0_0_0_3px_rgb(244,63,94,0.13)]",  badge: "bg-rose-50 text-rose-700",   label: "Blocking" },
};

function DecisionCoverageSection({ snapshot }: { snapshot: BusinessCommercialTruthSnapshot }) {
  const coverage = snapshot.coverage;

  const rows = [
    {
      id: "thresholds",
      label: "Thresholds",
      detail: coverage?.thresholds
        ? `Target ROAS ${coverage.thresholds.targetRoas ?? "—"}x · Break-even ROAS ${coverage.thresholds.breakEvenRoas ?? "—"}x`
        : "Not configured",
      status: coverage?.thresholds?.targetRoas ? "complete" : "missing",
    },
    {
      id: "actionCeil",
      label: "Action ceilings",
      detail: (coverage?.actionCeilings?.length ?? 0) > 0
        ? (coverage?.actionCeilings ?? []).map((a) => a.replaceAll("_", " ")).join(", ")
        : "None active",
      status: "complete",
    },
    {
      id: "countryEconomics",
      label: "Country economics",
      detail: snapshot.countryEconomics.length > 0
        ? `${snapshot.countryEconomics.length} GEO override${snapshot.countryEconomics.length !== 1 ? "s" : ""}`
        : "No GEO overrides",
      status: (coverage?.requiredInputs ?? []).find((r) => r.section === "countryEconomics")
        ? ((coverage?.requiredInputs ?? []).find((r) => r.section === "countryEconomics")?.blocking ? "blocking" : "missing")
        : "optional",
    },
    {
      id: "calibration",
      label: "Calibration bootstrap",
      detail: (snapshot.calibrationProfiles?.length ?? 0) > 0
        ? `${snapshot.calibrationProfiles?.length ?? 0} calibration profile${(snapshot.calibrationProfiles?.length ?? 0) !== 1 ? "s" : ""}`
        : "No calibration profiles",
      status: (snapshot.calibrationProfiles?.length ?? 0) > 0 ? "complete" : "missing",
    },
    {
      id: "promo",
      label: "Promo calendar",
      detail: snapshot.promoCalendar.length > 0
        ? `${snapshot.promoCalendar.length} promo window${snapshot.promoCalendar.length !== 1 ? "s" : ""}`
        : "No promo windows",
      status: "optional",
    },
    {
      id: "operating",
      label: "Operating constraints",
      detail: snapshot.operatingConstraints
        ? `Site: ${snapshot.operatingConstraints.siteIssueStatus} · Stock: ${snapshot.operatingConstraints.stockPressureStatus}`
        : "Not configured",
      status: snapshot.operatingConstraints ? "complete" : "optional",
    },
  ] as const;

  const blockingRows = rows.filter((r) => r.status === "blocking");

  return (
    <CtSection
      eyebrow="Section 1"
      title="Decision Coverage"
      subtitle="What Adsecute has so it can run with confidence. Blocking items hold the engine on conservative fallbacks."
    >
      {blockingRows.length > 0 && (
        <div className="mb-4 flex gap-3 rounded-[10px] border-l-4 border-amber-400 bg-amber-50 px-4 py-3.5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-0.5 shrink-0">
            <path d="M9 1.5l8 14H1l8-14z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M9 6.5v4M9 12.5v.6" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-bold text-amber-800">Blocking reasons</p>
            <p className="text-[12.5px] leading-snug text-amber-900">
              {blockingRows.map((r) => r.detail).join(" · ")}. The engine stays on conservative fallbacks until these clear.
            </p>
          </div>
        </div>
      )}
      <div
        className="grid overflow-hidden rounded-xl border border-slate-200"
        style={{ gridTemplateColumns: "1fr 1fr" }}
        data-testid="commercial-coverage-summary"
      >
        {rows.map((r, i) => {
          const tone = COVERAGE_TONE[r.status as keyof typeof COVERAGE_TONE] ?? COVERAGE_TONE.optional;
          const col = i % 2;
          const row = Math.floor(i / 2);
          return (
            <div
              key={r.id}
              className={`grid items-center gap-2.5 bg-white px-3.5 py-2.5 ${row > 0 ? "border-t border-slate-100" : ""} ${col === 1 ? "border-l border-slate-100" : ""}`}
              style={{ gridTemplateColumns: "12px 1fr auto" }}
            >
              <div className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${tone.ring}`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-[12.5px] font-semibold text-slate-900">{r.label}</p>
                <p className="truncate text-[11.5px] text-slate-500">{r.detail}</p>
              </div>
              <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10.5px] font-semibold ${tone.badge}`}>
                {tone.label}
              </span>
            </div>
          );
        })}
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Cost Structure
// ---------------------------------------------------------------------------

interface CostInputs {
  cogs: number;
  shipping: number;
  fulfillment: number;
  processing: number;
}

function CostStructureSection({
  costs,
  onChange,
  totalCost,
  breakEven,
  disabled,
}: {
  costs: CostInputs;
  onChange: (k: keyof CostInputs, v: number) => void;
  totalCost: number;
  breakEven: number;
  disabled?: boolean;
}) {
  return (
    <CtSection
      eyebrow="Section 2"
      title="Cost Structure"
      subtitle="All inputs are manual. SKU-level cost data isn't reliable from APIs — your blended numbers are what we use."
    >
      <div className="grid grid-cols-2 gap-4">
        <CtField label="Blended COGS" helper="Average cost of goods as % of revenue, blended across your product mix.">
          <CtNumberInput value={costs.cogs} onChange={(v) => onChange("cogs", v ?? 0)} suffix="%" disabled={disabled} />
        </CtField>
        <CtField label="Shipping cost" helper="What you pay per shipment — not what the customer pays. Free-shipping stores still pay this.">
          <CtNumberInput value={costs.shipping} onChange={(v) => onChange("shipping", v ?? 0)} suffix="%" disabled={disabled} />
        </CtField>
        <CtField label="Fulfillment cost" helper="Warehouse, 3PL, or pick-and-pack cost per order.">
          <CtNumberInput value={costs.fulfillment} onChange={(v) => onChange("fulfillment", v ?? 0)} suffix="%" disabled={disabled} />
        </CtField>
        <CtField label="Payment processing" helper="Credit card and gateway fees.">
          <CtNumberInput value={costs.processing} onChange={(v) => onChange("processing", v ?? 0)} suffix="%" disabled={disabled} />
        </CtField>
      </div>
      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <CtStatCard
          label="Total variable cost"
          value={`${totalCost.toFixed(1)}%`}
          helper="Sum of the four cost inputs"
        />
        <CtStatCard
          dominant
          label="Break-even ROAS"
          value={isFinite(breakEven) ? `${breakEven.toFixed(2)}x` : "—"}
          helper="1 ÷ (1 − total variable cost). Below this, every dollar of ad spend loses money on variable costs alone."
        />
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 3: ROAS Scenario Guide
// ---------------------------------------------------------------------------

const DEFAULT_SPEND_LEVELS = [10000, 20000, 30000, 50000, 100000];

function fmtMoney(n: number) {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

function RoasScenarioSection({
  targetRoas,
  costPct,
  breakEven,
}: {
  targetRoas: number;
  costPct: number;
  breakEven: number;
}) {
  const [spendLevels, setSpendLevels] = useState<number[]>(DEFAULT_SPEND_LEVELS);
  const [columnRoas, setColumnRoas] = useState<number[]>(DEFAULT_SPEND_LEVELS.map(() => targetRoas));

  const prevRoasRef = { current: targetRoas };
  useEffect(() => {
    setColumnRoas((rs) => rs.map((r) => (Math.abs(r - prevRoasRef.current) < 0.001 ? targetRoas : r)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRoas]);

  useEffect(() => {
    setColumnRoas((rs) => {
      if (rs.length === spendLevels.length) return rs;
      const next = rs.slice(0, spendLevels.length);
      while (next.length < spendLevels.length) next.push(targetRoas);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendLevels.length]);

  const resetRoas = () => setColumnRoas(spendLevels.map(() => targetRoas));

  const cols = spendLevels.map((spend, i) => {
    const roas = columnRoas[i] ?? targetRoas;
    const revenue = spend * roas;
    const variable = revenue * costPct;
    const grossProfit = revenue - variable;
    const netProfit = grossProfit - spend;
    const margin = revenue > 0 ? netProfit / revenue : 0;
    return { spend, roas, revenue, variable, grossProfit, netProfit, margin };
  });

  let bestIdx = -1;
  let bestProfit = -Infinity;
  cols.forEach((c, i) => {
    if (c.netProfit > bestProfit) { bestProfit = c.netProfit; bestIdx = i; }
  });

  const rows: { label: string; values: string[]; neg?: boolean[]; highlight?: boolean; muted?: boolean }[] = [
    { label: "Ad-attributed revenue", values: cols.map((c) => fmtMoney(c.revenue)) },
    { label: "Variable costs", values: cols.map((c) => fmtMoney(c.variable)) },
    { label: "Gross profit", values: cols.map((c) => fmtMoney(c.grossProfit)), neg: cols.map((c) => c.grossProfit < 0) },
    { label: "Ad spend", values: cols.map((c) => fmtMoney(c.spend)) },
    { label: "Net profit", values: cols.map((c) => fmtMoney(c.netProfit)), neg: cols.map((c) => c.netProfit < 0), highlight: true },
    { label: "Net margin", values: cols.map((c) => fmtPct(c.margin)), neg: cols.map((c) => c.netProfit < 0) },
  ];

  return (
    <CtSection
      eyebrow="Section 3"
      title="ROAS Scenario Guide"
      subtitle="Compare how spend × ROAS combinations stack up. Edit spend levels in the header and ROAS per column — the table recalculates live."
      action={<CtGhostBtn onClick={resetRoas}>Reset ROAS to {targetRoas.toFixed(2)}x</CtGhostBtn>}
    >
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {/* Header row: spend inputs */}
        <div
          className="grid bg-slate-900 text-white"
          style={{ gridTemplateColumns: `200px repeat(${cols.length}, minmax(0, 1fr))` }}
        >
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
            Spend / month
          </div>
          {spendLevels.map((s, i) => (
            <div
              key={i}
              className={`flex items-center justify-end border-l border-white/10 p-2 ${i === bestIdx ? "bg-emerald-500/20" : ""}`}
            >
              <div className="flex h-8 items-center gap-0.5 rounded-lg bg-white/10 px-2.5 text-[13px] font-bold tabular-nums text-white">
                <span>$</span>
                <input
                  type="number"
                  step={1000}
                  min={0}
                  value={s}
                  onChange={(e) => {
                    const next = spendLevels.slice();
                    next[i] = parseFloat(e.target.value) || 0;
                    setSpendLevels(next);
                  }}
                  className="w-20 bg-transparent text-right outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* ROAS row: editable per column */}
        <div
          className="grid border-b border-slate-200 bg-amber-50"
          style={{ gridTemplateColumns: `200px repeat(${cols.length}, minmax(0, 1fr))` }}
        >
          <div className="flex flex-col justify-center px-4 py-2.5">
            <p className="text-[12px] font-bold text-amber-800">Target ROAS</p>
            <p className="text-[10.5px] text-amber-700">edit per column</p>
          </div>
          {columnRoas.map((r, i) => {
            const belowBE = r > 0 && r < breakEven;
            return (
              <div key={i} className="flex items-center justify-end border-l border-amber-200/60 p-2">
                <div
                  className={`flex h-8 items-center gap-0.5 rounded-lg px-2.5 text-[13px] font-bold tabular-nums ${
                    i === bestIdx
                      ? "bg-emerald-500 text-white"
                      : belowBE
                        ? "border border-rose-400 bg-rose-50 text-rose-800"
                        : "border border-amber-200 bg-amber-100/60 text-amber-900"
                  }`}
                >
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={r}
                    onChange={(e) => {
                      const next = columnRoas.slice();
                      next[i] = parseFloat(e.target.value) || 0;
                      setColumnRoas(next);
                    }}
                    className="w-14 bg-transparent text-right outline-none"
                  />
                  <span>x</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Body rows */}
        {rows.map((r, ri) => (
          <div
            key={ri}
            className={`grid border-t border-slate-100 ${r.highlight ? "bg-slate-900" : ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
            style={{ gridTemplateColumns: `200px repeat(${cols.length}, minmax(0, 1fr))` }}
          >
            <div
              className={`px-4 py-3 text-[12.5px] ${r.highlight ? "font-bold text-white" : r.muted ? "text-slate-500" : "font-medium text-slate-900"}`}
            >
              {r.label}
            </div>
            {r.values.map((v, j) => {
              const isNeg = r.neg?.[j] ?? false;
              const isBest = j === bestIdx;
              return (
                <div
                  key={j}
                  className={`border-l px-3.5 py-3 text-right text-[13px] tabular-nums ${
                    r.highlight
                      ? `border-white/10 font-bold ${isNeg ? "text-rose-300" : "text-white"} ${isBest ? "bg-emerald-500/18" : ""}`
                      : `border-slate-100 ${isNeg ? "bg-rose-50 text-rose-700 font-medium" : isBest && !r.muted ? "bg-emerald-50 font-semibold text-slate-900" : r.muted ? "text-slate-500" : "text-slate-900"}`
                  }`}
                >
                  {v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Target ROAS
// ---------------------------------------------------------------------------

function TargetRoasSection({
  targetRoas,
  onChange,
  breakEven,
  disabled,
}: {
  targetRoas: number | null | undefined;
  onChange: (v: number | null) => void;
  breakEven: number;
  disabled?: boolean;
}) {
  const val = targetRoas ?? 0;
  const ratio = isFinite(breakEven) && breakEven > 0 ? val / breakEven : 0;

  let statusBg: string, statusBorder: string, statusDot: string, statusText: string, statusMsg: string;
  if (!val || val <= 0) {
    statusBg = "bg-slate-50"; statusBorder = "border-slate-200"; statusDot = "bg-slate-400"; statusText = "text-slate-500";
    statusMsg = "Set a target above zero.";
  } else if (isFinite(breakEven) && val < breakEven) {
    statusBg = "bg-rose-50"; statusBorder = "border-rose-200"; statusDot = "bg-rose-500"; statusText = "text-rose-700";
    statusMsg = "Below break-even — this target loses money on variable costs alone.";
  } else if (ratio < 1.2) {
    statusBg = "bg-amber-50"; statusBorder = "border-amber-200"; statusDot = "bg-amber-400"; statusText = "text-amber-700";
    statusMsg = "Close to break-even — limited buffer for volatility or returns.";
  } else {
    const above = (val - breakEven).toFixed(2);
    statusBg = "bg-emerald-50"; statusBorder = "border-emerald-200"; statusDot = "bg-emerald-500"; statusText = "text-emerald-700";
    statusMsg = `${above}x above break-even — healthy margin buffer.`;
  }

  return (
    <CtSection
      eyebrow="Section 4"
      title="Target ROAS"
      subtitle="The single performance target the engine compares every campaign against."
    >
      <div className="grid items-center gap-6" style={{ gridTemplateColumns: "minmax(240px, 360px) 1fr" }}>
        <div className="flex flex-col gap-3">
          <div className="flex h-14 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4">
            <input
              type="number"
              step={0.1}
              min={0}
              value={val || ""}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              data-testid="commercial-target-roas"
              className="min-w-0 flex-1 bg-transparent text-[28px] font-bold tabular-nums tracking-[-0.02em] text-slate-900 outline-none disabled:opacity-60"
            />
            <span className="text-[18px] text-slate-500">x</span>
          </div>
          <div className={`flex items-center gap-2 rounded-[10px] border px-3 py-2.5 ${statusBg} ${statusBorder}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
            <p className={`text-[12.5px] font-semibold leading-snug ${statusText}`}>{statusMsg}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Break-even ROAS</p>
            <p className="text-[22px] font-bold tabular-nums tracking-[-0.02em] text-slate-900">
              {isFinite(breakEven) && breakEven > 0 ? `${breakEven.toFixed(2)}x` : "—"}
            </p>
            <p className="text-[11.5px] text-slate-500">Derived from your cost structure</p>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Break-even ROAS (manual)</p>
            <CtNumberInput
              value={null}
              onChange={() => {}}
              suffix="x"
              disabled={disabled}
            />
            <p className="text-[11.5px] text-slate-500">Override if cost inputs unavailable</p>
          </div>
        </div>
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Country Economics
// ---------------------------------------------------------------------------

const COUNTRY_OPTIONS = [
  { value: "", label: "Select country" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "NO", label: "Norway" },
  { value: "TR", label: "Turkey" },
];

function CountryEconomicsSection({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: {
  rows: BusinessCommercialTruthSnapshot["countryEconomics"];
  onAdd: () => void;
  onUpdate: (i: number, field: string, value: unknown) => void;
  onRemove: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <CtSection
      eyebrow="Section 5"
      title="Country Economics"
      subtitle="Optional. Override the global cost structure for specific countries when shipping or COGS materially differ."
      action={<CtGhostBtn onClick={onAdd} disabled={disabled}>+ Add country</CtGhostBtn>}
    >
      {rows.length === 0 ? (
        <CtEmptyState message="No GEO economics yet. Adsecute will use your global cost structure for every country." />
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="grid px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1.6fr 36px" }}
          >
            <span>Country</span>
            <span>Economics multiplier</span>
            <span>Margin modifier</span>
            <span>Notes</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={`${r.countryCode || "row"}-${i}`}
              className="grid items-center gap-2.5"
              style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1.6fr 36px" }}
            >
              <CtSelect
                value={r.countryCode}
                onChange={(v) => onUpdate(i, "countryCode", v.toUpperCase())}
                options={COUNTRY_OPTIONS}
                disabled={disabled}
              />
              <CtNumberInput
                value={r.economicsMultiplier}
                onChange={(v) => onUpdate(i, "economicsMultiplier", v)}
                disabled={disabled}
              />
              <CtNumberInput
                value={r.marginModifier}
                onChange={(v) => onUpdate(i, "marginModifier", v)}
                disabled={disabled}
              />
              <CtTextInput
                value={r.notes ?? ""}
                onChange={(v) => onUpdate(i, "notes", v || null)}
                placeholder="Why this override?"
                disabled={disabled}
              />
              <CtIconCircleBtn onClick={() => onRemove(i)} disabled={disabled}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 2L9 9M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </CtIconCircleBtn>
            </div>
          ))}
        </div>
      )}
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Promo Calendar
// ---------------------------------------------------------------------------

function PromoCalendarSection({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: {
  rows: BusinessCommercialTruthSnapshot["promoCalendar"];
  onAdd: () => void;
  onUpdate: (i: number, field: string, value: unknown) => void;
  onRemove: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <CtSection
      eyebrow="Section 6"
      title="Promo Calendar"
      subtitle="Optional. Tell the engine when revenue is lifted by a promotion so scaling decisions don't read promo lift as creative strength."
      action={<CtGhostBtn onClick={onAdd} disabled={disabled}>+ Add promo window</CtGhostBtn>}
    >
      {rows.length === 0 ? (
        <CtEmptyState message="No promo windows yet. Operating mode will still match — just without promo-aware scaling caps." />
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="grid px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 36px" }}
          >
            <span>Name</span>
            <span>Start</span>
            <span>End</span>
            <span>Severity</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={r.eventId}
              className="grid items-center gap-2.5"
              style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 36px" }}
            >
              <CtTextInput
                value={r.title}
                onChange={(v) => onUpdate(i, "title", v)}
                placeholder="e.g. Spring Sale"
                disabled={disabled}
              />
              <input
                type="date"
                value={r.startDate}
                onChange={(e) => onUpdate(i, "startDate", e.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none disabled:opacity-60"
              />
              <input
                type="date"
                value={r.endDate}
                onChange={(e) => onUpdate(i, "endDate", e.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none disabled:opacity-60"
              />
              <CtSelect
                value={r.severity}
                onChange={(v) => onUpdate(i, "severity", v)}
                options={BUSINESS_PROMO_SEVERITIES.map((s) => ({ value: s, label: s }))}
                disabled={disabled}
              />
              <CtIconCircleBtn onClick={() => onRemove(i)} disabled={disabled}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 2L9 9M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </CtIconCircleBtn>
            </div>
          ))}
        </div>
      )}
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 7: Site Health & Stock Pressure
// ---------------------------------------------------------------------------

function SiteHealthSection({
  constraints,
  onUpdate,
  disabled,
}: {
  constraints: NonNullable<BusinessCommercialTruthSnapshot["operatingConstraints"]>;
  onUpdate: (field: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const issueOpts = BUSINESS_ISSUE_STATUSES.map((s) => ({ value: s, label: s }));
  const stockOpts = BUSINESS_STOCK_PRESSURE_STATUSES.map((s) => ({ value: s, label: s }));

  return (
    <CtSection
      eyebrow="Section 7"
      title="Site Health &amp; Stock Pressure"
      subtitle="Operational blockers that should hold scaling decisions until cleared."
    >
      <div className="grid grid-cols-2 gap-4">
        <CtField label="Site issue">
          <CtSelect value={constraints.siteIssueStatus} onChange={(v) => onUpdate("siteIssueStatus", v)} options={issueOpts} disabled={disabled} />
        </CtField>
        <CtField label="Checkout issue">
          <CtSelect value={constraints.checkoutIssueStatus} onChange={(v) => onUpdate("checkoutIssueStatus", v)} options={issueOpts} disabled={disabled} />
        </CtField>
        <CtField label="Conversion tracking">
          <CtSelect value={constraints.conversionTrackingIssueStatus} onChange={(v) => onUpdate("conversionTrackingIssueStatus", v)} options={issueOpts} disabled={disabled} />
        </CtField>
        <CtField label="Feed issue">
          <CtSelect value={constraints.feedIssueStatus} onChange={(v) => onUpdate("feedIssueStatus", v)} options={issueOpts} disabled={disabled} />
        </CtField>
        <CtField label="Stock pressure">
          <CtSelect
            value={constraints.stockPressureStatus}
            onChange={(v) => onUpdate("stockPressureStatus", v)}
            options={stockOpts}
            disabled={disabled}
          />
        </CtField>
        <CtField label="Manual do-not-scale reason">
          <CtTextInput
            value={constraints.manualDoNotScaleReason ?? ""}
            onChange={(v) => onUpdate("manualDoNotScaleReason", v || null)}
            placeholder="Optional override note"
            disabled={disabled}
          />
        </CtField>
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Section 8: Decision Calibration
// ---------------------------------------------------------------------------

const CALIBRATION_CARDS = [
  { id: "conservative" as const, title: "Conservative", desc: "Tight ceilings, hold-on-no-data. Best for new accounts or volatile periods." },
  { id: "balanced" as const, title: "Balanced", desc: "Default. Step-ups at 20% with weekly review cadence." },
  { id: "aggressive" as const, title: "Aggressive", desc: "Faster ceilings, larger increments. Mature accounts with stable signal only." },
];

function CalibrationSection({
  riskPosture,
  onChange,
  disabled,
}: {
  riskPosture: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <CtSection
      eyebrow="Section 8"
      title="Decision Calibration"
      subtitle="How aggressive the engine is with scale-up actions before live feedback exists."
    >
      <div className="grid grid-cols-3 gap-3">
        {CALIBRATION_CARDS.map((o) => {
          const active = riskPosture === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{o.title}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7.5l2.5 2.5L11 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className={`text-[12px] leading-snug ${active ? "text-white/70" : "text-slate-500"}`}>
                {o.desc}
              </span>
            </button>
          );
        })}
      </div>
    </CtSection>
  );
}

// ---------------------------------------------------------------------------
// Sticky save bar
// ---------------------------------------------------------------------------

function StickySaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  disabled,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-7 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/92 px-6 py-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full ${dirty ? "bg-amber-400" : "bg-emerald-500"}`} />
        <span className="text-[12.5px] text-slate-500">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onDiscard}
          disabled={!dirty || disabled}
          className="h-9 rounded-[10px] border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          data-testid="commercial-settings-save"
          className="h-9 rounded-[10px] border border-slate-900 bg-slate-900 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Commercial Truth"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommercialTruthSettingsSection({ businessId }: { businessId: string }) {
  const [snapshot, setSnapshot] = useState<BusinessCommercialTruthSnapshot>(
    createEmptyBusinessCommercialTruthSnapshot(businessId),
  );
  const [permissions, setPermissions] = useState<CommercialTruthSettingsResponse["permissions"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Local cost inputs (UI-only, used to compute break-even ROAS)
  const [costs, setCostsState] = useState<CostInputs>({ cogs: 0, shipping: 0, fulfillment: 0, processing: 0 });
  const setCost = (k: keyof CostInputs, v: number) => {
    setCostsState((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  const totalCost = costs.cogs + costs.shipping + costs.fulfillment + costs.processing;
  const totalCostPct = totalCost / 100;
  const computedBreakEven = totalCostPct >= 1 ? Infinity : 1 / (1 - totalCostPct);

  const canEdit = permissions?.canEdit ?? false;
  const effectiveDisabled = !canEdit || loading;

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/business-commercial-settings?businessId=${encodeURIComponent(businessId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as CommercialTruthSettingsResponse | null;
      if (!response.ok || !payload?.snapshot || !payload.permissions) {
        throw new Error("Could not load commercial truth settings.");
      }
      setSnapshot(payload.snapshot);
      setPermissions(payload.permissions);
      setDirty(false);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load commercial truth settings.");
      setSnapshot(createEmptyBusinessCommercialTruthSnapshot(businessId));
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    setSnapshot(createEmptyBusinessCommercialTruthSnapshot(businessId));
    setPermissions(null);
    void loadSnapshot();
  }, [businessId, loadSnapshot]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    // Sync computed break-even ROAS into snapshot before saving
    const snapshotToSave: BusinessCommercialTruthSnapshot = {
      ...snapshot,
      targetPack: {
        ...(snapshot.targetPack ?? createEmptyTargetPack()),
        breakEvenRoas: isFinite(computedBreakEven) && totalCost > 0
          ? Math.round(computedBreakEven * 100) / 100
          : (snapshot.targetPack?.breakEvenRoas ?? null),
      },
    };
    try {
      const response = await fetch("/api/business-commercial-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, snapshot: snapshotToSave }),
      });
      const payload = (await response.json().catch(() => null)) as CommercialTruthSettingsResponse | null;
      if (!response.ok || !payload?.snapshot || !payload.permissions) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Could not save commercial truth settings.");
      }
      setSnapshot(payload.snapshot);
      setPermissions(payload.permissions);
      setNotice("Commercial truth settings updated.");
      setDirty(false);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save commercial truth settings.");
    } finally {
      setSaving(false);
    }
  }

  const updateTargetPack = useCallback(
    (field: keyof NonNullable<BusinessCommercialTruthSnapshot["targetPack"]>, value: unknown) => {
      setSnapshot((current) => ({
        ...current,
        targetPack: { ...(current.targetPack ?? createEmptyTargetPack()), [field]: value },
      }));
      setDirty(true);
    },
    [],
  );

  const updateCountry = useCallback(
    (index: number, field: string, value: unknown) => {
      setSnapshot((current) => ({
        ...current,
        countryEconomics: current.countryEconomics.map((row, i) =>
          i === index ? { ...row, [field]: value } : row,
        ),
      }));
      setDirty(true);
    },
    [],
  );

  const updatePromo = useCallback(
    (index: number, field: string, value: unknown) => {
      setSnapshot((current) => ({
        ...current,
        promoCalendar: current.promoCalendar.map((row, i) =>
          i === index ? { ...row, [field]: value } : row,
        ),
      }));
      setDirty(true);
    },
    [],
  );

  const updateConstraints = useCallback(
    (field: string, value: unknown) => {
      setSnapshot((current) => ({
        ...current,
        operatingConstraints: {
          ...(current.operatingConstraints ?? createEmptyOperatingConstraints()),
          [field]: value,
        },
      }));
      setDirty(true);
    },
    [],
  );

  const targetPack = snapshot.targetPack ?? createEmptyTargetPack();
  const operatingConstraints = snapshot.operatingConstraints ?? createEmptyOperatingConstraints();

  const countryRows = useMemo(() => snapshot.countryEconomics, [snapshot.countryEconomics]);
  const promoRows = useMemo(() => snapshot.promoCalendar, [snapshot.promoCalendar]);

  const displayBreakEven = totalCost > 0 && isFinite(computedBreakEven)
    ? computedBreakEven
    : (targetPack.breakEvenRoas ?? 0);

  return (
    <div className="flex flex-col gap-4" data-testid="commercial-truth-settings">
      {/* Status banners */}
      {!loading && permissions?.reason ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissions.reason}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <p className="text-[13px] text-slate-500">Loading commercial truth settings…</p>
        </div>
      ) : null}

      <DecisionCoverageSection snapshot={snapshot} />

      <CostStructureSection
        costs={costs}
        onChange={setCost}
        totalCost={totalCost}
        breakEven={computedBreakEven}
        disabled={effectiveDisabled}
      />

      <RoasScenarioSection
        targetRoas={targetPack.targetRoas ?? 3.5}
        costPct={totalCostPct}
        breakEven={displayBreakEven}
      />

      <TargetRoasSection
        targetRoas={targetPack.targetRoas}
        onChange={(v) => updateTargetPack("targetRoas", v)}
        breakEven={displayBreakEven}
        disabled={effectiveDisabled}
      />

      <CountryEconomicsSection
        rows={countryRows}
        onAdd={() => {
          setSnapshot((current) => ({
            ...current,
            countryEconomics: [...current.countryEconomics, createEmptyCountryEconomicsRow()],
          }));
          setDirty(true);
        }}
        onUpdate={updateCountry}
        onRemove={(i) => {
          setSnapshot((current) => ({
            ...current,
            countryEconomics: current.countryEconomics.filter((_, idx) => idx !== i),
          }));
          setDirty(true);
        }}
        disabled={effectiveDisabled}
      />

      <PromoCalendarSection
        rows={promoRows}
        onAdd={() => {
          setSnapshot((current) => ({
            ...current,
            promoCalendar: [...current.promoCalendar, createEmptyPromoCalendarEvent()],
          }));
          setDirty(true);
        }}
        onUpdate={updatePromo}
        onRemove={(i) => {
          setSnapshot((current) => ({
            ...current,
            promoCalendar: current.promoCalendar.filter((_, idx) => idx !== i),
          }));
          setDirty(true);
        }}
        disabled={effectiveDisabled}
      />

      <SiteHealthSection
        constraints={operatingConstraints}
        onUpdate={updateConstraints}
        disabled={effectiveDisabled}
      />

      <CalibrationSection
        riskPosture={targetPack.defaultRiskPosture}
        onChange={(v) => updateTargetPack("defaultRiskPosture", v)}
        disabled={effectiveDisabled}
      />

      <StickySaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={() => {
          void loadSnapshot();
          setCostsState({ cogs: 0, shipping: 0, fulfillment: 0, processing: 0 });
        }}
        disabled={effectiveDisabled || saving}
      />
    </div>
  );
}
