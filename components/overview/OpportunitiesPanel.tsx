"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OpportunityItem } from "@/lib/overviewInsights";

interface OpportunitiesPanelProps {
  items: OpportunityItem[];
  onOpenDetails: (item: OpportunityItem) => void;
}

export function OpportunitiesPanel({ items, onOpenDetails }: OpportunitiesPanelProps) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Opportunities</h2>
        <p className="text-sm text-muted-foreground">
          Rule-based suggestions built from current integration signals.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border bg-background p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <Badge variant="secondary">{item.impact}</Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{item.description}</p>

            {item.disabled && item.emptyMessage ? (
              <p className="mb-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {item.emptyMessage}
              </p>
            ) : null}

            <Button
              size="sm"
              variant="outline"
              disabled={item.disabled}
              onClick={() => onOpenDetails(item)}
            >
              View details
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
