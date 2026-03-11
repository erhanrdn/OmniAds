/**
 * GEO Intelligence — Momentum Engine v3
 *
 * Detects whether a query, topic, page, or traffic source is accelerating,
 * stable, or declining by comparing current vs previous equivalent period.
 */

// ── Types ────────────────────────────────────────────────────────────

export type MomentumStatus = "breakout" | "rising" | "stable" | "declining";
export type MomentumStrength = "high" | "medium" | "low";

export interface Momentum {
  status: MomentumStatus;
  strength: MomentumStrength;
  /** Normalised 0–100 momentum score */
  score: number;
  /** Growth rate as decimal (e.g. 0.5 = +50%, -0.3 = -30%) */
  growthRate: number;
  /** Human-readable label */
  label: string;
}

// ── Core computation ─────────────────────────────────────────────────

/**
 * Compute momentum from a current and previous metric value.
 *
 * @param current  Value in the current period
 * @param previous Value in the previous equivalent period (0 if no prior data)
 * @param minSignificance Minimum `current` value to avoid noise (default 5)
 */
export function computeMomentum(
  current: number,
  previous: number,
  minSignificance = 5
): Momentum {
  // If signal is too small, call it stable with low confidence
  if (current < minSignificance && previous < minSignificance) {
    return { status: "stable", strength: "low", score: 50, growthRate: 0, label: "Stable (low signal)" };
  }

  // New entrant: was zero, now has traffic
  if (previous === 0 && current >= minSignificance) {
    return { status: "breakout", strength: "high", score: 95, growthRate: 1, label: "New — appeared this period" };
  }

  // Growth rate
  const growthRate = previous > 0 ? (current - previous) / previous : 1;

  let status: MomentumStatus;
  let strength: MomentumStrength;
  let score: number;
  let label: string;

  if (growthRate >= 0.6) {
    status = "breakout";
    strength = "high";
    score = Math.min(100, Math.round(70 + growthRate * 20));
    label = `Breakout +${pct(growthRate)} vs prior period`;
  } else if (growthRate >= 0.15) {
    status = "rising";
    strength = growthRate >= 0.35 ? "high" : "medium";
    score = Math.round(55 + growthRate * 30);
    label = `Rising +${pct(growthRate)} vs prior period`;
  } else if (growthRate >= -0.1) {
    status = "stable";
    strength = "low";
    score = Math.round(45 + growthRate * 50);
    label = `Stable (${growthRate >= 0 ? "+" : ""}${pct(growthRate)})`;
  } else {
    status = "declining";
    strength = growthRate <= -0.4 ? "high" : "medium";
    score = Math.max(5, Math.round(40 + growthRate * 50));
    label = `Declining ${pct(growthRate)} vs prior period`;
  }

  return { status, strength, score, growthRate, label };
}

function pct(rate: number): string {
  return `${rate >= 0 ? "+" : ""}${(rate * 100).toFixed(0)}%`;
}

// ── Period utilities ─────────────────────────────────────────────────

/**
 * Resolve a GA4-style relative date ("30daysAgo", "yesterday") or absolute
 * ISO date string to an absolute Date.
 */
export function resolveDate(dateStr: string): Date {
  const q = dateStr.trim().toLowerCase();
  if (q === "today") return new Date();
  if (q === "yesterday") return new Date(Date.now() - 86400000);
  const daysMatch = q.match(/^(\d+)daysago$/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    return new Date(Date.now() - days * 86400000);
  }
  return new Date(dateStr); // ISO date
}

/**
 * Given a current [startDate, endDate] window, compute the immediately
 * preceding period of the same length.
 */
export function computePreviousPeriod(
  startDate: string,
  endDate: string
): { prevStart: string; prevEnd: string } {
  const start = resolveDate(startDate);
  const end = resolveDate(endDate);
  const periodMs = end.getTime() - start.getTime() + 86400000; // inclusive

  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - periodMs + 86400000);

  return {
    prevStart: toISO(prevStart),
    prevEnd: toISO(prevEnd),
  };
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Row-level diff helpers ────────────────────────────────────────────

/**
 * Build a lookup map from an array of SC/GA4 rows keyed by a string identifier.
 */
export function buildValueMap<T extends { key: string; value: number }>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.key, r.value);
  return m;
}

/**
 * Compute momentum for a keyed metric by comparing current and previous maps.
 */
export function computeRowMomentum(
  key: string,
  currentMap: Map<string, number>,
  previousMap: Map<string, number>,
  minSignificance = 5
): Momentum {
  const current = currentMap.get(key) ?? 0;
  const previous = previousMap.get(key) ?? 0;
  return computeMomentum(current, previous, minSignificance);
}

// ── Display helpers ──────────────────────────────────────────────────

export const MOMENTUM_BADGE: Record<MomentumStatus, { label: string; cls: string }> = {
  breakout: { label: "⚡ Breakout", cls: "text-violet-600 dark:text-violet-400" },
  rising:   { label: "↑ Rising",   cls: "text-emerald-600 dark:text-emerald-400" },
  stable:   { label: "→ Stable",   cls: "text-muted-foreground" },
  declining:{ label: "↓ Declining",cls: "text-amber-600 dark:text-amber-400" },
};
