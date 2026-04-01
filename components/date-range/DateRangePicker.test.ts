import {
  DEFAULT_DATE_RANGE,
  getPresetDates,
  getPickerKeyboardAction,
  resolveRangeCalendarDateClick,
  resolveRangePresetSelection,
} from "@/components/date-range/DateRangePicker";
import { afterEach, beforeEach, vi } from "vitest";

const RealDateTimeFormat = Intl.DateTimeFormat;

describe("DateRangePicker quick-apply behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Intl.DateTimeFormat = RealDateTimeFormat;
  });

  it("updates draft on first quick preset click without applying", () => {
    const result = resolveRangePresetSelection(
      {
        ...DEFAULT_DATE_RANGE,
        rangePreset: "30d",
        customStart: "2026-03-01",
        customEnd: "2026-03-30",
      },
      "today",
      "2026-03-30"
    );

    expect(result.shouldApply).toBe(false);
    expect(result.nextDraft.rangePreset).toBe("today");
    expect(result.nextDraft.customStart).toBe("2026-03-30");
    expect(result.nextDraft.customEnd).toBe("2026-03-30");
  });

  it("applies on second quick preset click for non-custom presets", () => {
    const result = resolveRangePresetSelection(
      {
        ...DEFAULT_DATE_RANGE,
        rangePreset: "today",
        customStart: "2026-03-30",
        customEnd: "2026-03-30",
      },
      "today",
      "2026-03-30"
    );

    expect(result.shouldApply).toBe(true);
  });

  it("does not auto-apply the custom preset on repeat click", () => {
    const result = resolveRangePresetSelection(
      {
        ...DEFAULT_DATE_RANGE,
        rangePreset: "custom",
        customStart: "2026-03-03",
        customEnd: "2026-03-03",
      },
      "custom",
      "2026-03-30"
    );

    expect(result.shouldApply).toBe(false);
  });

  it("applies when the same custom date is clicked twice", () => {
    const result = resolveRangeCalendarDateClick(
      {
        ...DEFAULT_DATE_RANGE,
        rangePreset: "custom",
        customStart: "2026-03-03",
        customEnd: "2026-03-03",
      },
      "end",
      "2026-03-03"
    );

    expect(result.shouldApply).toBe(true);
    expect(result.nextPickStep).toBe("start");
    expect(result.nextDraft.customStart).toBe("2026-03-03");
    expect(result.nextDraft.customEnd).toBe("2026-03-03");
  });

  it("keeps manual apply flow for multi-day custom selections", () => {
    const result = resolveRangeCalendarDateClick(
      {
        ...DEFAULT_DATE_RANGE,
        rangePreset: "custom",
        customStart: "2026-03-03",
        customEnd: "2026-03-03",
      },
      "end",
      "2026-03-05"
    );

    expect(result.shouldApply).toBe(false);
    expect(result.nextPickStep).toBe("start");
    expect(result.nextDraft.customStart).toBe("2026-03-03");
    expect(result.nextDraft.customEnd).toBe("2026-03-05");
  });

  it("maps Enter/Escape to apply and cancel", () => {
    expect(getPickerKeyboardAction("Enter")).toBe("apply");
    expect(getPickerKeyboardAction("Escape")).toBe("cancel");
    expect(getPickerKeyboardAction("Tab")).toBeNull();
  });

  it("resolves today using the browser timezone instead of UTC serialization", () => {
    vi.setSystemTime(new Date("2026-03-31T21:30:00.000Z"));
    Intl.DateTimeFormat = function (...args: ConstructorParameters<typeof RealDateTimeFormat>) {
      if (args.length === 0) {
        return {
          resolvedOptions: () => ({ timeZone: "Europe/Istanbul" }),
        } as Intl.DateTimeFormat;
      }
      return new RealDateTimeFormat(...args);
    } as typeof Intl.DateTimeFormat;

    const result = getPresetDates("today");

    expect(result).toEqual({ start: "2026-04-01", end: "2026-04-01" });
  });
});
