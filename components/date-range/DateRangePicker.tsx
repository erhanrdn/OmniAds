"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "90d"
  | "365d"
  | "lastMonth"
  | "custom";

export type ComparisonPreset =
  | "none"
  | "previousPeriod"
  | "previousWeek"
  | "previousMonth"
  | "previousQuarter"
  | "previousYear"
  | "previousYearMatch";

export interface DateRangeValue {
  rangePreset: RangePreset;
  customStart: string; // "YYYY-MM-DD"
  customEnd: string;   // "YYYY-MM-DD"
  comparisonPreset: ComparisonPreset;
  comparisonStart: string;
  comparisonEnd: string;
}

export const DEFAULT_DATE_RANGE: DateRangeValue = {
  rangePreset: "30d",
  customStart: "",
  customEnd: "",
  comparisonPreset: "none",
  comparisonStart: "",
  comparisonEnd: "",
};

// ── Preset definitions ────────────────────────────────────────────────────────

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "14d", label: "Last 14 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "365d", label: "Last 365 Days" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom" },
];

const COMPARISON_PRESETS: { value: ComparisonPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "previousPeriod", label: "Previous period" },
  { value: "previousWeek", label: "Previous week" },
  { value: "previousMonth", label: "Previous month" },
  { value: "previousQuarter", label: "Previous quarter" },
  { value: "previousYear", label: "Previous year" },
  { value: "previousYearMatch", label: "Previous year (match)" },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function getPresetDates(
  preset: RangePreset,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today":
      return { start: toISO(today), end: toISO(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: toISO(y), end: toISO(y) };
    }
    case "7d":
      return { start: toISO(addDays(today, -6)), end: toISO(today) };
    case "14d":
      return { start: toISO(addDays(today, -13)), end: toISO(today) };
    case "30d":
      return { start: toISO(addDays(today, -29)), end: toISO(today) };
    case "90d":
      return { start: toISO(addDays(today, -89)), end: toISO(today) };
    case "365d":
      return { start: toISO(addDays(today, -364)), end: toISO(today) };
    case "lastMonth": {
      const y = today.getFullYear();
      const m = today.getMonth();
      const start = new Date(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: toISO(start), end: toISO(end) };
    }
    case "custom":
      return {
        start: customStart || toISO(addDays(today, -29)),
        end: customEnd || toISO(today),
      };
  }
}

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const s = formatDateLabel(start);
  const e = formatDateLabel(end);
  return start === end ? s : `${s} – ${e}`;
}

function getTriggerLabel(value: DateRangeValue): string {
  if (value.rangePreset === "custom") {
    return formatDateRange(value.customStart, value.customEnd) || "Custom";
  }
  return RANGE_PRESETS.find((p) => p.value === value.rangePreset)?.label ?? "Select range";
}

function getComparisonLabel(value: DateRangeValue): string {
  return COMPARISON_PRESETS.find((p) => p.value === value.comparisonPreset)?.label ?? "None";
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (string | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface CalendarProps {
  year: number;
  month: number;
  rangeStart: string;
  rangeEnd: string;
  hoverDate: string;
  pickStep: "start" | "end";
  interactive: boolean;
  onDateClick: (date: string) => void;
  onDateHover: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

function Calendar({
  year,
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  pickStep,
  interactive,
  onDateClick,
  onDateHover,
  onMonthChange,
}: CalendarProps) {
  const cells = buildMonthGrid(year, month);

  const prevMonth = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };
  const nextMonth = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };

  const effectiveEnd =
    interactive && pickStep === "end" && hoverDate && hoverDate > rangeStart
      ? hoverDate
      : rangeEnd;

  function getCellClass(date: string): string {
    const isStart = date === rangeStart;
    const isEnd = date === effectiveEnd;
    const inRange =
      rangeStart && effectiveEnd && date > rangeStart && date < effectiveEnd;

    if (isStart || isEnd) {
      return "h-8 w-8 flex items-center justify-center text-xs rounded-full cursor-pointer bg-foreground text-background font-medium";
    }
    if (inRange) {
      return "h-8 w-8 flex items-center justify-center text-xs cursor-pointer bg-accent/70 text-accent-foreground rounded-none";
    }
    return cn(
      "h-8 w-8 flex items-center justify-center text-xs rounded-full transition-colors",
      interactive ? "cursor-pointer hover:bg-accent" : "cursor-default"
    );
  }

  return (
    <div className="w-72 select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map((d) => (
          <div
            key={d}
            className="h-8 flex items-center justify-center text-[10px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => (
          <div key={i} className="flex items-center justify-center">
            {date ? (
              <button
                type="button"
                className={getCellClass(date)}
                onClick={() => interactive && onDateClick(date)}
                onMouseEnter={() => interactive && onDateHover(date)}
              >
                {parseInt(date.slice(8))}
              </button>
            ) : (
              <div className="h-8 w-8" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Preset + Calendar Panel ───────────────────────────────────────────────────

interface PanelProps {
  mode: "range" | "comparison";
  draft: DateRangeValue;
  onDraftChange: (d: DateRangeValue) => void;
  onApply: () => void;
  onCancel: () => void;
}

function Panel({ mode, draft, onDraftChange, onApply, onCancel }: PanelProps) {
  const today = new Date();
  const isRange = mode === "range";

  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [pickStep, setPickStep] = useState<"start" | "end">("start");
  const [hoverDate, setHoverDate] = useState("");

  const isCustom = isRange
    ? draft.rangePreset === "custom"
    : false;

  const { start: displayStart, end: displayEnd } = isRange
    ? getPresetDates(draft.rangePreset, draft.customStart, draft.customEnd)
    : { start: draft.comparisonStart, end: draft.comparisonEnd };

  function handleDateClick(date: string) {
    if (!isRange) return;
    if (pickStep === "start" || draft.rangePreset !== "custom") {
      onDraftChange({
        ...draft,
        rangePreset: "custom",
        customStart: date,
        customEnd: date,
      });
      setPickStep("end");
    } else {
      if (date < draft.customStart) {
        onDraftChange({ ...draft, customStart: date, customEnd: draft.customStart });
      } else {
        onDraftChange({ ...draft, customEnd: date });
      }
      setPickStep("start");
    }
  }

  const presets = isRange ? RANGE_PRESETS : COMPARISON_PRESETS;

  return (
    <div className="flex flex-col">
      <div className="flex">
        {/* Left: Presets */}
        <div className="w-52 border-r py-2 flex flex-col">
          <p className="px-4 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {isRange ? "Date range" : "Compare to"}
          </p>
          {presets.map((preset) => {
            const selected = isRange
              ? draft.rangePreset === preset.value
              : draft.comparisonPreset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  if (isRange) {
                    onDraftChange({ ...draft, rangePreset: preset.value as RangePreset });
                    if (preset.value === "custom") setPickStep("start");
                  } else {
                    onDraftChange({
                      ...draft,
                      comparisonPreset: preset.value as ComparisonPreset,
                    });
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-sm text-left transition-colors hover:bg-accent",
                  selected && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    selected ? "bg-foreground" : "bg-transparent"
                  )}
                />
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Right: Calendar */}
        <div className="flex flex-col gap-3 p-4">
          <Calendar
            year={calYear}
            month={calMonth}
            rangeStart={displayStart}
            rangeEnd={displayEnd}
            hoverDate={hoverDate}
            pickStep={pickStep}
            interactive={isRange}
            onDateClick={handleDateClick}
            onDateHover={setHoverDate}
            onMonthChange={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
            }}
          />

          {isCustom && (
            <p className="text-center text-xs text-muted-foreground">
              {pickStep === "start" ? "Select start date" : "Select end date"}
            </p>
          )}

          {displayStart && displayEnd && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-center text-xs">
              {formatDateRange(displayStart, displayEnd)}
            </div>
          )}

          <p className="text-center text-[10px] text-muted-foreground">
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-80 transition-opacity"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ── DateRangePicker (main export) ─────────────────────────────────────────────

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
  showComparisonTrigger?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  showComparisonTrigger = true,
}: DateRangePickerProps) {
  const [openMode, setOpenMode] = useState<"range" | "comparison" | null>(null);
  const [draft, setDraft] = useState<DateRangeValue>(value);

  function openPanel(mode: "range" | "comparison") {
    setDraft({ ...value });
    setOpenMode(mode);
  }

  function handleApply() {
    onChange(draft);
    setOpenMode(null);
  }

  function handleCancel() {
    setDraft({ ...value });
    setOpenMode(null);
  }

  const rangeLabel = getTriggerLabel(value);
  const compLabel = getComparisonLabel(value);
  const hasComparison = value.comparisonPreset !== "none";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Main range trigger */}
      <Popover.Root
        open={openMode === "range"}
        onOpenChange={(open) => {
          if (open) openPanel("range");
          else if (openMode === "range") handleCancel();
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm hover:bg-accent transition-colors"
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{rangeLabel}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="z-50 overflow-hidden rounded-xl border bg-popover shadow-xl"
            onInteractOutside={handleCancel}
          >
            <Panel
              mode="range"
              draft={draft}
              onDraftChange={setDraft}
              onApply={handleApply}
              onCancel={handleCancel}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {showComparisonTrigger ? (
        <Popover.Root
          open={openMode === "comparison"}
          onOpenChange={(open) => {
            if (open) openPanel("comparison");
            else if (openMode === "comparison") handleCancel();
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm transition-colors",
                hasComparison
                  ? "border-foreground/40 font-medium"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <span>{compLabel}</span>
              <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="start"
              className="z-50 overflow-hidden rounded-xl border bg-popover shadow-xl"
              onInteractOutside={handleCancel}
            >
              <Panel
                mode="comparison"
                draft={draft}
                onDraftChange={setDraft}
                onApply={handleApply}
                onCancel={handleCancel}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}
