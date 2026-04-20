import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { isGoogleAdsControlPlaneClosed } from "@/lib/google-ads/sync-progress-ux";
import type { MetaUiLanguage } from "@/lib/meta/ui-status";
import { shouldSuppressRecoverableGoogleSyncIssue } from "@/lib/sync/user-visible-sync";

export type GoogleIntegrationProgressStageState =
  | "ready"
  | "working"
  | "waiting"
  | "blocked";

export type GoogleIntegrationProgressStageKey =
  | "connection"
  | "queue_worker"
  | "core_data"
  | "selected_range"
  | "analysis"
  | "attention";

export interface GoogleIntegrationProgressStage {
  key: GoogleIntegrationProgressStageKey;
  title: string;
  state: GoogleIntegrationProgressStageState;
  label: string;
  detail: string;
  percent: number | null;
  evidence: string | null;
}

export interface GoogleIntegrationProgressModel {
  stages: GoogleIntegrationProgressStage[];
  attentionNeeded: boolean;
}

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function getStageTitle(
  key: GoogleIntegrationProgressStageKey,
  language: MetaUiLanguage,
) {
  switch (key) {
    case "connection":
      return language === "tr" ? "Bağlantı" : "Connection";
    case "queue_worker":
      return language === "tr" ? "Kuyruk / worker" : "Queue / worker";
    case "core_data":
      return language === "tr" ? "Çekirdek veri" : "Core data";
    case "selected_range":
      return language === "tr" ? "Seçili aralık" : "Selected range";
    case "analysis":
      return language === "tr" ? "Analiz / advisor" : "Analysis / advisor";
    default:
      return language === "tr" ? "Dikkat / toparlama" : "Attention / recovery";
  }
}

function getQueueEvidence(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
) {
  const parts: string[] = [];
  const queueDepth = status.jobHealth?.queueDepth ?? 0;
  const leasedPartitions = status.jobHealth?.leasedPartitions ?? 0;
  const deadLetterPartitions = status.jobHealth?.deadLetterPartitions ?? 0;
  const repairCount = status.repairPlan?.recommendations?.length ?? 0;

  if (deadLetterPartitions > 0) {
    parts.push(language === "tr" ? `Dead ${deadLetterPartitions}` : `Dead ${deadLetterPartitions}`);
  }
  if (queueDepth > 0) {
    parts.push(language === "tr" ? `Kuyruk ${queueDepth}` : `Queue ${queueDepth}`);
  }
  if (leasedPartitions > 0) {
    parts.push(language === "tr" ? `Lease ${leasedPartitions}` : `Leased ${leasedPartitions}`);
  }
  if (repairCount > 0) {
    parts.push(language === "tr" ? `Toparlama ${repairCount}` : `Recovery ${repairCount}`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function localizeSurfaceName(
  scope: string,
  language: MetaUiLanguage,
) {
  switch (scope) {
    case "campaign_daily":
      return language === "tr" ? "kampanya kapsamı" : "campaign coverage";
    case "search_term_daily":
      return language === "tr" ? "arama sorguları" : "search intelligence";
    case "product_daily":
      return language === "tr" ? "ürün performansı" : "product performance";
    case "asset_daily":
      return language === "tr" ? "asset performansı" : "asset performance";
    case "asset_group_daily":
      return language === "tr" ? "asset group kapsamı" : "asset group coverage";
    case "geo_daily":
      return language === "tr" ? "coğrafi performans" : "geo performance";
    case "device_daily":
      return language === "tr" ? "cihaz performansı" : "device performance";
    case "audience_daily":
      return language === "tr" ? "kitle performansı" : "audience performance";
    default:
      return scope.replace(/_/g, " ");
  }
}

function buildSelectedRangeEvidence(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
) {
  const range = status.warehouse?.coverage?.selectedRange;
  if (range?.totalDays && range.totalDays > 0) {
    const readyThrough = range.readyThroughDate
      ? language === "tr"
        ? `Hazır: ${range.readyThroughDate}`
        : `Ready through ${range.readyThroughDate}`
      : null;
    return [`${range.completedDays}/${range.totalDays} ${language === "tr" ? "gün" : "days"}`, readyThrough]
      .filter(Boolean)
      .join(" • ");
  }

  return null;
}

function getAnalysisEvidence(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
) {
  const advisor = status.advisor;
  if (!advisor) return null;
  const parts: string[] = [];
  if (advisor.readinessWindowDays) {
    parts.push(
      language === "tr"
        ? `${advisor.readinessWindowDays} günlük destek`
        : `${advisor.readinessWindowDays}-day support`,
    );
  }
  if (advisor.missingSurfaces.length > 0) {
    parts.push(
      language === "tr"
        ? `Bekleyen ${advisor.missingSurfaces
            .slice(0, 3)
            .map((scope) => localizeSurfaceName(scope, language))
            .join(", ")}`
        : `Pending ${advisor.missingSurfaces
            .slice(0, 3)
            .map((scope) => localizeSurfaceName(scope, language))
            .join(", ")}`,
    );
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function getAttentionEvidence(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
) {
  const parts: string[] = [];
  const repairCount = status.repairPlan?.recommendations?.length ?? 0;
  const blockerClass = status.blockerClass;
  const controlPlaneErrors = status.controlPlaneErrors;

  if (repairCount > 0) {
    parts.push(
      language === "tr"
        ? `${repairCount} toparlama önerisi`
        : `${repairCount} repair recommendation${repairCount === 1 ? "" : "s"}`,
    );
  }
  if (blockerClass && blockerClass !== "none") {
    parts.push(blockerClass.replace(/_/g, " "));
  }
  if (controlPlaneErrors) {
    const errorCount = Object.values(controlPlaneErrors).filter(Boolean).length;
    if (errorCount > 0) {
      parts.push(
        language === "tr"
          ? `${errorCount} control-plane hata`
          : `${errorCount} control-plane error${errorCount === 1 ? "" : "s"}`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function buildConnectionStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  const assignedCount = status.assignedAccountIds.length;
  return {
    key: "connection",
    title: getStageTitle("connection", language),
    state: "ready",
    label: language === "tr" ? "bağlı" : "connected",
    detail:
      assignedCount > 1
        ? language === "tr"
          ? `Bu workspace için ${assignedCount} Google Ads hesabı atanmış.`
          : `${assignedCount} Google Ads accounts are assigned to this workspace.`
        : language === "tr"
          ? "Bu workspace için Google Ads hesabı atanmış."
          : "Google Ads account is assigned to this workspace.",
    percent: null,
    evidence: status.primaryAccountTimezone
      ? language === "tr"
        ? `Birincil saat dilimi ${status.primaryAccountTimezone}`
        : `Primary timezone ${status.primaryAccountTimezone}`
      : null,
  };
}

function buildQueueStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  if (isGoogleAdsControlPlaneClosed(status)) {
    return {
      key: "queue_worker",
      title: getStageTitle("queue_worker", language),
      state: "ready",
      label: language === "tr" ? "kuyruk temiz" : "queue clear",
      detail:
        language === "tr"
          ? "Bekleyen Google Ads işi yok."
          : "No queued Google Ads work is waiting right now.",
      percent: null,
      evidence: getQueueEvidence(status, language),
    };
  }
  const suppressRecoverableSync = shouldSuppressRecoverableGoogleSyncIssue(status);

  const queueDepth = status.jobHealth?.queueDepth ?? 0;
  const leasedPartitions = status.jobHealth?.leasedPartitions ?? 0;
  const deadLetterPartitions = status.jobHealth?.deadLetterPartitions ?? 0;
  const progressState = status.operations?.progressState ?? null;
  const state =
    deadLetterPartitions > 0 ||
    progressState === "blocked" ||
    status.blockerClass === "queue_blocked"
      ? suppressRecoverableSync
        ? "working"
        : "blocked"
      : status.state === "paused" ||
          progressState === "partial_stuck" ||
          (queueDepth > 0 && leasedPartitions === 0)
        ? "waiting"
        : leasedPartitions > 0 ||
            progressState === "syncing" ||
            progressState === "partial_progressing" ||
            status.latestSync?.status === "running" ||
            status.latestSync?.status === "pending" ||
            queueDepth > 0
          ? "working"
          : "ready";

  const label =
    state === "blocked"
      ? language === "tr"
        ? "müdahale gerekiyor"
        : "attention needed"
      : state === "waiting"
        ? language === "tr"
          ? "kuyruk beklemede"
          : "queue waiting"
        : state === "working"
          ? language === "tr"
            ? "worker aktif"
            : "worker active"
          : language === "tr"
            ? "kuyruk temiz"
            : "queue clear";
  const detail =
    state === "blocked"
      ? language === "tr"
        ? "Google Ads kuyruk sağlığı temiz biçimde tamamlanmadan önce toparlanmalı."
        : "Google Ads queue health needs recovery before it can finish cleanly."
      : state === "waiting"
        ? language === "tr"
          ? "Kuyruktaki Google Ads işi worker'ın devam etmesini bekliyor."
          : "Queued Google Ads work is waiting for the worker to continue."
        : state === "working"
          ? language === "tr"
            ? "Google Ads senkronu kuyruktaki işi aktif olarak işliyor."
            : "Google Ads sync is actively processing queued work."
          : language === "tr"
            ? "Bekleyen Google Ads işi yok."
            : "No queued Google Ads work is waiting right now.";

  return {
    key: "queue_worker",
    title: getStageTitle("queue_worker", language),
    state,
    label,
    detail,
    percent: null,
    evidence: getQueueEvidence(status, language),
  };
}

function buildCoreStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  const core = status.domains?.core;
  const requiredCoverage = status.requiredScopeCompletion;
  const state: GoogleIntegrationProgressStageState =
    core?.state === "ready"
      ? "ready"
      : status.state === "paused"
        ? "waiting"
        : status.state === "action_required" && !status.panel?.coreUsable
          ? "blocked"
          : "working";

  return {
    key: "core_data",
    title: getStageTitle("core_data", language),
    state,
    label:
      state === "ready"
        ? language === "tr"
          ? "çekirdek hazır"
          : "core ready"
        : state === "waiting"
          ? language === "tr"
            ? "çekirdek beklemede"
            : "core waiting"
          : state === "blocked"
            ? language === "tr"
              ? "çekirdek bloklu"
              : "core blocked"
            : language === "tr"
              ? "çekirdek hazırlanıyor"
              : "core preparing",
    detail:
      core?.detail ??
      (language === "tr"
        ? "Özet ve kampanya verisi hâlâ hazırlanıyor."
        : "Summary and campaign data are still being prepared."),
    percent:
      requiredCoverage && !requiredCoverage.complete
        ? clampPercent(requiredCoverage.percent)
        : null,
    evidence:
      requiredCoverage?.readyThroughDate
        ? language === "tr"
          ? `Hazır: ${requiredCoverage.readyThroughDate}`
          : `Ready through ${requiredCoverage.readyThroughDate}`
        : null,
  };
}

function buildSelectedRangeStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  const selectedRange = status.domains?.selectedRange;
  const range = status.warehouse?.coverage?.selectedRange;
  const percent =
    range && range.totalDays > 0 && !range.isComplete
      ? clampPercent((range.completedDays / Math.max(1, range.totalDays)) * 100)
      : null;
  const state: GoogleIntegrationProgressStageState =
    selectedRange?.state === "ready"
      ? "ready"
      : selectedRange?.state === "partial"
        ? "working"
        : status.state === "paused"
          ? "waiting"
          : "working";

  return {
    key: "selected_range",
    title: getStageTitle("selected_range", language),
    state,
    label:
      selectedRange?.state === "ready"
        ? language === "tr"
          ? "aralık hazır"
          : "range ready"
        : selectedRange?.state === "partial"
          ? language === "tr"
            ? "aralık kısmi"
            : "range partial"
          : status.selectedRangeReadinessBasis?.mode === "current_day_live"
            ? language === "tr"
              ? "bugün canlı"
              : "today live"
            : language === "tr"
              ? "aralık hazırlanıyor"
              : "range preparing",
    detail:
      selectedRange?.detail ??
      (language === "tr"
        ? "Seçili aralık için görünür yüzeyler hazırlanıyor."
        : "Visible selected-range surfaces are still preparing."),
    percent,
    evidence: buildSelectedRangeEvidence(status, language),
  };
}

function buildAnalysisStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  const advisor = status.domains?.advisor;
  const advisorProgress = status.advisorProgress;
  const state: GoogleIntegrationProgressStageState =
    advisor?.state === "ready"
      ? "ready"
      : status.state === "paused"
        ? "waiting"
        : status.operations?.advisorSnapshotBlockedReason
          ? "blocked"
          : "working";

  return {
    key: "analysis",
    title: getStageTitle("analysis", language),
    state,
    label:
      state === "ready"
        ? language === "tr"
          ? "analiz hazır"
          : "analysis ready"
        : state === "waiting"
          ? language === "tr"
            ? "analiz beklemede"
            : "analysis waiting"
          : state === "blocked"
            ? language === "tr"
              ? "analiz bloklu"
              : "analysis blocked"
            : language === "tr"
              ? "analiz hazırlanıyor"
              : "analysis preparing",
    detail:
      advisor?.detail ??
      status.advisor?.blockingMessage ??
      (language === "tr"
        ? "Google Ads çok pencereli analiz kapsamı hazırlanıyor."
        : "Google Ads multi-window analysis coverage is still preparing."),
    percent:
      advisorProgress?.visible === true ? clampPercent(advisorProgress.percent) : null,
    evidence: getAnalysisEvidence(status, language),
  };
}

function shouldRenderAttentionStage(status: GoogleAdsStatusResponse) {
  if (shouldSuppressRecoverableGoogleSyncIssue(status)) {
    return false;
  }
  if (isGoogleAdsControlPlaneClosed(status)) {
    return false;
  }

  return Boolean(
    status.controlPlaneErrors &&
      Object.values(status.controlPlaneErrors).some(Boolean),
  ) ||
    Boolean(
      status.controlPlanePersistence?.exactRowsPresent === true &&
        ((status.releaseGate?.verdict != null &&
          status.releaseGate.verdict !== "pass") ||
          (status.repairPlan?.recommendations?.length ?? 0) > 0 ||
          (status.blockerClass != null && status.blockerClass !== "none")),
    ) ||
    status.state === "action_required" ||
    status.state === "stale";
}

function buildAttentionStage(
  status: GoogleAdsStatusResponse,
  language: MetaUiLanguage,
): GoogleIntegrationProgressStage {
  return {
    key: "attention",
    title: getStageTitle("attention", language),
    state: "blocked",
    label: language === "tr" ? "müdahale gerekiyor" : "attention needed",
    detail:
      status.releaseGate?.summary ??
      status.advisor?.blockingMessage ??
      (language === "tr"
        ? "Google Ads senkronu temiz biçimde tamamlanmadan önce toparlanmalı."
        : "Google Ads needs recovery before this sync can finish cleanly."),
    percent: null,
    evidence: getAttentionEvidence(status, language),
  };
}

export function resolveGoogleIntegrationProgress(
  status: GoogleAdsStatusResponse | undefined | null,
  language: MetaUiLanguage = "en",
): GoogleIntegrationProgressModel | null {
  if (!status?.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;

  const stages: GoogleIntegrationProgressStage[] = [
    buildConnectionStage(status, language),
    buildQueueStage(status, language),
    buildCoreStage(status, language),
    buildSelectedRangeStage(status, language),
    buildAnalysisStage(status, language),
  ];

  if (shouldRenderAttentionStage(status)) {
    stages.push(buildAttentionStage(status, language));
  }

  return {
    stages,
    attentionNeeded: stages.some((stage) => stage.key === "attention"),
  };
}
