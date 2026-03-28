import {
  getPresetDatesForReferenceDate,
  type DateRangeValue,
} from "@/components/date-range/DateRangePicker";

export function getMetaPresetDates(input: {
  value: DateRangeValue;
  referenceDate?: string | null;
}) {
  if (!input.referenceDate) return null;
  return getPresetDatesForReferenceDate(
    input.value.rangePreset,
    input.referenceDate,
    input.value.customStart,
    input.value.customEnd
  );
}

