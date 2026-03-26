import { describe, expect, it } from "vitest";
import {
  computeNiceAxisTicks,
  normalizePercentSeries,
  resolveChartDomain,
} from "@/lib/chart-domain";

describe("chart domain helpers", () => {
  it("normalizes ratio-format percent series into percentage values", () => {
    expect(normalizePercentSeries([0.0041, 0.0044, 0.0038])).toEqual([0.41, 0.44, 0.38]);
  });

  it("keeps percentage values unchanged when already scaled", () => {
    expect(normalizePercentSeries([0.41, 0.44, 0.38])).toEqual([0.41, 0.44, 0.38]);
  });

  it("builds an adaptive domain for low percent series without forcing 0-100 scale", () => {
    const resolved = resolveChartDomain([0.31, 0.42, 0.48], {
      unit: "percent",
      mode: "adaptive",
      detailLevel: "sparkline",
    });

    expect(resolved.min).toBeGreaterThanOrEqual(0);
    expect(resolved.max).toBeLessThan(5);
    expect(resolved.max - resolved.min).toBeGreaterThan(0.1);
  });

  it("adds visual padding for flat series", () => {
    const resolved = resolveChartDomain([10, 10, 10, 10], {
      unit: "count",
      mode: "adaptive",
      detailLevel: "sparkline",
    });

    expect(resolved.max).toBeGreaterThan(resolved.min);
    expect(resolved.min).toBeLessThanOrEqual(10);
    expect(resolved.max).toBeGreaterThanOrEqual(10);
  });

  it("keeps non-negative units above zero", () => {
    const resolved = resolveChartDomain([2.31, 2.44, 2.38], {
      unit: "ratio",
      mode: "adaptive",
      detailLevel: "detail",
    });

    expect(resolved.min).toBeGreaterThanOrEqual(0);
  });

  it("clamps percent domains to 0..100", () => {
    const resolved = resolveChartDomain([99.5, 100.2, 101], {
      unit: "percent",
      mode: "adaptive",
      detailLevel: "detail",
    });

    expect(resolved.min).toBeGreaterThanOrEqual(0);
    expect(resolved.max).toBeLessThanOrEqual(100);
  });

  it("supports zero-based mode", () => {
    const resolved = resolveChartDomain([20, 22, 25], {
      unit: "count",
      mode: "zero_based",
      detailLevel: "detail",
    });

    expect(resolved.min).toBe(0);
    expect(resolved.max).toBeGreaterThan(25);
  });

  it("computes nice ticks across arbitrary min/max domains", () => {
    const ticks = computeNiceAxisTicks(2.2, 2.8, 4);
    expect(ticks[0]).toBeLessThanOrEqual(2.2);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(2.8);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});
