"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";
import { generateAiAnalysis } from "@/lib/generateAiAnalysis";

interface CreativeInsightsDrawerProps {
  row: MetaCreativeRow | null;
  open: boolean;
  notes: string;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
}

export function CreativeInsightsDrawer({
  row,
  open,
  notes,
  onOpenChange,
  onNotesChange,
}: CreativeInsightsDrawerProps) {
  if (!row) return null;
  const analysis = useMemo(() => generateAiAnalysis(row), [row]);

  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNotesChange(event.target.value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Creative Insight</SheetTitle>
          <SheetDescription>Meta performance breakdown and action plan.</SheetDescription>
        </SheetHeader>

        {/* Hero preview */}
        <div className="shrink-0 border-b bg-muted/20 px-5 pt-5 pb-4">
          <div className="mx-auto max-w-md overflow-hidden rounded-xl border bg-background shadow-sm">
            <CreativeRenderSurface
              id={row.id}
              name={row.name}
              preview={row.preview}
              size="large"
              mode="full"
            />
          </div>

          {/* Identity bar */}
          <div className="mt-4 space-y-1.5">
            <p className="text-sm font-semibold leading-tight">{row.name}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">Meta</Badge>
              <Badge variant="outline" className="text-[10px]">{row.creativeTypeLabel}</Badge>
              <span className="text-[11px] text-muted-foreground">Launched {row.launchDate}</span>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* Analysis sections */}
          <AnalysisBlock title="Summary" items={analysis.summary} />
          <AnalysisBlock title="Performance Insights" items={analysis.performanceInsights} />
          <AnalysisBlock title="Recommendations" items={analysis.recommendations} />
          <AnalysisBlock title="Risks & Warnings" items={analysis.risks} />

          {/* Where it runs */}
          <section className="rounded-xl border p-3.5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Where it runs
            </h3>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <MetaField label="Campaign" value={row.tags[0] ? `Campaign - ${row.tags[0]}` : "Campaign - Main"} />
              <MetaField label="Ad Set" value="Ad Set - Performance Cohort" />
              <MetaField label="Ad" value={row.name} />
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-xl border p-3.5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add analysis notes..."
              className="min-h-24 w-full rounded-lg border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AnalysisBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border p-3.5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1.5 text-[13px] leading-relaxed">
        {items.map((item, index) => (
          <li key={`${title}_${index}`} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-[12px] font-medium">{value}</p>
    </div>
  );
}
