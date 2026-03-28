import type { MetaStatusResponse } from "@/lib/meta/status-types";

export type MetaUiLanguage = "en" | "tr";

function getLocale(language: MetaUiLanguage) {
  return language === "tr" ? "tr-TR" : "en-US";
}

export function formatMetaDate(
  value: string | null | undefined,
  language: MetaUiLanguage
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(getLocale(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatMetaDateTime(
  value: string | null | undefined,
  language: MetaUiLanguage
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(getLocale(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMetaReadyThroughDate(
  value: string | null | undefined,
  language: MetaUiLanguage
) {
  const formatted = formatMetaDate(value, language);
  if (!formatted) return null;
  return language === "tr" ? `Hazır: ${formatted}` : `Ready through ${formatted}`;
}

function formatMetaHistoricalOldestReachedDate(
  value: string | null | undefined,
  language: MetaUiLanguage
) {
  const formatted = formatMetaDate(value, language);
  if (!formatted) return null;
  return language === "tr"
    ? `DB'deki en eski tarih: ${formatted}`
    : `Oldest stored date: ${formatted}`;
}

function getMetaSyncCaptionContext(status: MetaStatusResponse) {
  const phaseLabel = status.latestSync?.phaseLabel ?? "";
  if (
    status.state === "paused" ||
    status.state === "stale" ||
    status.state === "action_required"
  ) {
    return "operational";
  }
  if (phaseLabel === "Preparing today's data" || phaseLabel === "Syncing recent history") {
    return "today_or_recent";
  }
  if (phaseLabel === "Preparing selected dates") {
    return "selected_range";
  }
  if (phaseLabel === "Backfilling historical data") {
    return "historical";
  }
  if (status.warehouse?.coverage?.selectedRange && !status.warehouse.coverage.selectedRange.isComplete) {
    return "selected_range";
  }
  return "default";
}

export function getMetaSyncTitle(
  status: MetaStatusResponse,
  language: MetaUiLanguage
) {
  if (status.latestSync?.phaseLabel) return status.latestSync.phaseLabel;
  if (status.state === "paused") {
    return language === "tr"
      ? "Meta kuyruğu senkron worker'ını bekliyor"
      : "Meta queue is waiting for the sync worker";
  }
  if (status.state === "partial") {
    return language === "tr"
      ? "Meta verileri kademeli olarak hazır oluyor"
      : "Meta data is becoming available progressively";
  }
  if (status.state === "action_required") {
    return language === "tr"
      ? "Meta senkronu için müdahale gerekiyor"
      : "Meta sync needs attention";
  }
  return language === "tr"
    ? "Meta geçmiş verileri hazırlanıyor"
    : "Meta historical data is syncing";
}

export function getMetaSyncDescription(
  status: MetaStatusResponse,
  language: MetaUiLanguage
) {
  if (status.state === "paused") {
    return language === "tr"
      ? "Kuyruktaki işler korunur. Worker yeniden devreye girdiğinde senkron otomatik devam eder."
      : "Queued work is safe. Sync will resume automatically when the worker becomes active again.";
  }
  if (status.state === "partial") {
    return language === "tr"
      ? "Hazır olan bölümleri kullanabilirsiniz; kalan geçmiş veri arka planda hazırlanmaya devam eder."
      : "You can use the sections that are ready while the remaining history continues preparing in the background.";
  }
  if (status.state === "action_required") {
    return language === "tr"
      ? "Arka plan senkronu tamamlanamadı. Entegrasyonu kontrol edin veya senkronu yeniden başlatın."
      : "Background sync stopped before finishing. Review the integration or restart the sync.";
  }
  return language === "tr"
    ? "Veriler hazırlanırken hazır olan bölümler kademeli olarak açılır."
    : "Available sections will unlock progressively while the rest of the data is prepared.";
}

export function getMetaSyncCaption(
  status: MetaStatusResponse,
  language: MetaUiLanguage
) {
  const latestSync = status.latestSync;
  if (!latestSync) return null;
  const context = getMetaSyncCaptionContext(status);

  const parts: string[] = [];
  if (
    typeof latestSync.completedDays === "number" &&
    typeof latestSync.totalDays === "number" &&
    latestSync.totalDays > 0
  ) {
    parts.push(
      language === "tr"
        ? `${latestSync.completedDays}/${latestSync.totalDays} gün`
        : `${latestSync.completedDays}/${latestSync.totalDays} days`
    );
  }

  if (context === "historical") {
    const latestLoadedDate = formatMetaHistoricalOldestReachedDate(
      status.warehouse?.firstDate ?? latestSync.readyThroughDate,
      language
    );
    if (latestLoadedDate) parts.push(latestLoadedDate);
    return parts.length > 0 ? parts.join(" • ") : null;
  }

  if (context === "operational") {
    return parts.length > 0 ? parts.join(" • ") : null;
  }

  const readyThrough = formatMetaReadyThroughDate(latestSync.readyThroughDate, language);
  if (readyThrough) parts.push(readyThrough);
  return parts.length > 0 ? parts.join(" • ") : null;
}

export function getMetaStatusNotice(
  status: MetaStatusResponse,
  language: MetaUiLanguage
) {
  if (status.state === "connected_no_assignment") {
    return language === "tr"
      ? "Bağlantı hazır, ancak bu workspace için henüz bir Meta reklam hesabı atanmadı."
      : "The connection is ready, but no Meta ad account has been assigned to this workspace yet.";
  }
  if (status.state === "action_required") {
    return status.latestSync?.lastError
      ? status.latestSync.lastError
      : getMetaSyncDescription(status, language);
  }
  if (status.state === "ready" && status.latestSync?.finishedAt) {
    const finishedAt = formatMetaDateTime(status.latestSync.finishedAt, language);
    return language === "tr"
      ? `Geçmiş veri hazır. Son senkron ${finishedAt ?? status.latestSync.finishedAt} tarihinde tamamlandı.`
      : `Historical data is ready. The last sync finished ${finishedAt ?? status.latestSync.finishedAt}.`;
  }
  return null;
}
