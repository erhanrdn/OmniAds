import {
  getPresetDates,
  getPresetDatesForReferenceDate,
  type DateRangeValue,
} from "@/components/date-range/DateRangePicker";

export function getMetaPresetDates(input: {
  value: DateRangeValue;
  referenceDate?: string | null;
}) {
  if (!input.referenceDate) {
    return getPresetDates(
      input.value.rangePreset,
      input.value.customStart,
      input.value.customEnd
    );
  }
  return getPresetDatesForReferenceDate(
    input.value.rangePreset,
    input.referenceDate,
    input.value.customStart,
    input.value.customEnd
  );
}
