import {
  DEFAULT_DATE_RANGE,
  getPickerKeyboardAction,
  resolveRangeCalendarDateClick,
  resolveRangePresetSelection,
} from "@/components/date-range/DateRangePicker";

describe("DateRangePicker quick-apply behavior", () => {
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
});
