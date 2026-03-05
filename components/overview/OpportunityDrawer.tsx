"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { OpportunityItem } from "@/lib/overviewInsights";
import { buildOpportunityNotes } from "@/lib/overviewInsights";

interface OpportunityDrawerProps {
  open: boolean;
  item: OpportunityItem | null;
  onOpenChange: (open: boolean) => void;
}

export function OpportunityDrawer({ open, item, onOpenChange }: OpportunityDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const onCopyNotes = async () => {
    const text = buildOpportunityNotes(item);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="space-y-2">
          <SheetTitle>{item.title}</SheetTitle>
          <SheetDescription>{item.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">AI Summary</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {item.summary.map((point) => (
                <li key={point}>- {point}</li>
              ))}
            </ul>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Evidence</h3>
            <div className="overflow-hidden rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Metric</th>
                    <th className="px-3 py-2">Current</th>
                    <th className="px-3 py-2">Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {item.evidence.map((row) => (
                    <tr key={row.label} className="border-t">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2">{row.current}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.benchmark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Suggested actions</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {item.actions.map((action) => (
                <li key={action}>- {action}</li>
              ))}
            </ul>
          </section>

          <Button onClick={onCopyNotes}>{copied ? "Copied" : "Copy notes"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
