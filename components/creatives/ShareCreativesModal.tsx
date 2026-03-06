"use client";

import { useState } from "react";
import { X, Copy, ExternalLink, Check, Lock, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareLinkConfig, ExportPdfConfig, ShareMetricKey } from "./shareCreativeTypes";
import { MOCK_SHARE_URL } from "./shareCreativeMock";

const SHARE_METRICS: { key: ShareMetricKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "purchaseValue", label: "Purchase value" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "ctrAll", label: "CTR" },
  { key: "purchases", label: "Purchases" },
];

interface ShareCreativesModalProps {
  selectedCount: number;
  onClose: () => void;
}

export function ShareCreativesModal({ selectedCount, onClose }: ShareCreativesModalProps) {
  const [tab, setTab] = useState<"link" | "pdf">("link");

  // Public link state
  const [linkConfig, setLinkConfig] = useState<ShareLinkConfig>({
    title: "",
    expiration: "7",
    metrics: ["spend", "roas", "cpa", "ctrAll", "purchases"],
    includeNotes: false,
    passwordProtection: false,
  });
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // PDF state
  const [pdfConfig, setPdfConfig] = useState<ExportPdfConfig>({
    title: "",
    includeSummary: true,
    includeNotes: false,
  });

  const toggleMetric = (key: ShareMetricKey) => {
    setLinkConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.includes(key)
        ? prev.metrics.filter((m) => m !== key)
        : [...prev.metrics, key],
    }));
  };

  const handleCreateLink = () => {
    setGeneratedUrl(MOCK_SHARE_URL);
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${generatedUrl}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenPreview = () => {
    window.open(generatedUrl ?? MOCK_SHARE_URL, "_blank");
  };

  const handleGeneratePdf = () => {
    const pdfUrl = `${MOCK_SHARE_URL}?print=1`;
    window.open(pdfUrl, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Share selected creatives</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedCount} creative{selectedCount !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button
            type="button"
            onClick={() => setTab("link")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              tab === "link"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            Public link
          </button>
          <button
            type="button"
            onClick={() => setTab("pdf")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              tab === "pdf"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-5">
          {tab === "link" && (
            <>
              {/* Share title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Share title</label>
                <input
                  type="text"
                  placeholder="e.g. Top performers — Feb 2026"
                  value={linkConfig.title}
                  onChange={(e) => setLinkConfig((prev) => ({ ...prev, title: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Expiration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Link expiration</label>
                <div className="flex gap-2">
                  {(["3", "7", "14"] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setLinkConfig((prev) => ({ ...prev, expiration: days }))}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                        linkConfig.expiration === days
                          ? "border-foreground bg-foreground text-background"
                          : "hover:border-foreground/50 text-muted-foreground"
                      }`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </div>

              {/* Show metrics */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Show metrics</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SHARE_METRICS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={linkConfig.metrics.includes(key)}
                        onChange={() => toggleMetric(key)}
                        className="rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <ToggleRow
                  label="Include notes"
                  checked={linkConfig.includeNotes}
                  onChange={(v) => setLinkConfig((prev) => ({ ...prev, includeNotes: v }))}
                />
                <ToggleRow
                  label={
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                      Password protection
                      <span className="text-[10px] text-muted-foreground">(UI only)</span>
                    </span>
                  }
                  checked={linkConfig.passwordProtection}
                  onChange={(v) => setLinkConfig((prev) => ({ ...prev, passwordProtection: v }))}
                />
              </div>

              {/* Generated URL */}
              {generatedUrl ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium">Share link</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}${generatedUrl}`}
                      className="h-9 flex-1 rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground outline-none"
                    />
                    <Button size="sm" variant="outline" onClick={handleCopyLink} className="shrink-0">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleOpenPreview} className="shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="w-full" onClick={handleCreateLink}>
                  Create link
                </Button>
              )}
            </>
          )}

          {tab === "pdf" && (
            <>
              {/* Report title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Report title</label>
                <input
                  type="text"
                  placeholder="e.g. Creative Performance Report"
                  value={pdfConfig.title}
                  onChange={(e) => setPdfConfig((prev) => ({ ...prev, title: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <ToggleRow
                  label="Include summary"
                  checked={pdfConfig.includeSummary}
                  onChange={(v) => setPdfConfig((prev) => ({ ...prev, includeSummary: v }))}
                />
                <ToggleRow
                  label="Include notes"
                  checked={pdfConfig.includeNotes}
                  onChange={(v) => setPdfConfig((prev) => ({ ...prev, includeNotes: v }))}
                />
              </div>

              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                A print-friendly view will open in a new tab. Use your browser&apos;s print dialog
                to save as PDF. Full server-side PDF export will be available after backend
                integration.
              </div>

              <Button className="w-full" onClick={handleGeneratePdf}>
                Generate PDF
              </Button>
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="border-t px-6 py-3">
          <p className="text-[11px] text-muted-foreground">
            Public links are intended to show only selected creatives. Expiration and access control
            will be enforced by backend.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs hover:bg-muted/20 transition-colors">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-foreground" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
