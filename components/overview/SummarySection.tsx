"use client";

import type { ReactNode } from "react";

export function SummarySection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
