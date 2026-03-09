"use client";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativePreviewInline } from "@/components/creatives/CreativePreview";
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
  const analysis = generateAiAnalysis(row);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader className="space-y-3">
          <SheetTitle>Creative Insight</SheetTitle>
          <SheetDescription>Meta performance breakdown and action plan.</SheetDescription>
          <div className="rounded-xl border p-3">
            <div className="flex items-start gap-3">
              <PreviewMedia row={row} />
              <div className="space-y-1">
                <p className="font-medium">{row.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Meta</Badge>
                  <Badge variant="outline">
                    {row.creativeTypeLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Launch date: {row.launchDate}</p>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-5">
          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">AI Analysis</h3>
            <Separator className="my-3" />

            <Block title="Summary" items={analysis.summary} />
            <Block title="Performance insights" items={analysis.performanceInsights} />
            <Block title="Recommendations" items={analysis.recommendations} />
            <Block title="Risks / Warnings" items={analysis.risks} />
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">Where it runs</h3>
            <Separator className="my-3" />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Campaign</p>
                <p>{row.tags[0] ? `Campaign - ${row.tags[0]}` : "Campaign - Main"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ad Set</p>
                <p>Ad Set - Performance Cohort</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ad</p>
                <p>{row.name}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">Notes</h3>
            <Separator className="my-3" />
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Add analysis notes..."
              className="min-h-32 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewMedia({ row }: { row: MetaCreativeRow }) {
  return (
    <CreativePreviewInline
      creative={{
        id: row.id,
        name: row.name,
        isCatalog: row.isCatalog,
        previewState: row.previewState,
        previewUrl: row.previewUrl,
        imageUrl: row.imageUrl,
        thumbnailUrl: row.thumbnailUrl,
      }}
    />
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}
