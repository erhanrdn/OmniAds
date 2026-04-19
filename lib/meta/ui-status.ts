import type { MetaStatusResponse } from "@/lib/meta/status-types";
import { getMetaPageReadiness } from "@/lib/meta/page-readiness";

export type MetaUiLanguage = "en" | "tr";

export type MetaPageMessagingState =
  | "not_connected"
  | "syncing_current_day"
  | "syncing_historical"
  | "partial_current_day"
  | "partial_historical"
  | "blocked"
  | "ready"
  | "ready_empty";

export interface MetaPageMessagingModel {
  state: MetaPageMessagingState;
  pill: {
    visible: boolean;
    label: string;
    state: "syncing" | "active" | "needs_attention";
    tone: "info" | "success" | "warning";
  };
  banner: {
    visible: boolean;
    title: string | null;
    description: string | null;
    tone: "info" | "success" | "warning";
  };
  emptyState: {
    title: string;
    description: string;
  };
  currentDayPreparing: {
    title: string;
    description: string;
  };
  kpi: {
    spendSubLabel: string;
    revenueSubLabel: string;
    avgCpaSubLabel: string;
    roasSubLabel: string;
  };
}

function getCurrentDayDescription(status: MetaStatusResponse, language: MetaUiLanguage) {
  const selectedDateLabel = status.currentDateInTimezone ?? "today";
  const timeZoneSuffix = status.primaryAccountTimezone
    ? ` (${status.primaryAccountTimezone})`
    : "";
  return language === "tr"
    ? `Meta bu tarih için veriyi hâlâ hazırlıyor. Referans gün ${selectedDateLabel}${timeZoneSuffix}.`
    : `Meta is still preparing data for this date. The current account day is ${selectedDateLabel}${timeZoneSuffix}.`;
}

function getNotConnectedDescription(status: MetaStatusResponse, language: MetaUiLanguage) {
  if ((status.assignedAccountIds?.length ?? 0) === 0) {
    return language === "tr"
      ? "Meta bağlantısı hazır, ancak bu workspace için henüz bir reklam hesabı atanmadı."
      : "Meta is connected, but no ad account has been assigned to this workspace yet.";
  }
  return language === "tr"
    ? "Meta bağlantısı kurulmadan seçili tarih aralığı için veri sunulamaz."
    : "The selected range cannot be served until the Meta integration is connected.";
}

function getReadyEmptyCopy(language: MetaUiLanguage) {
  return {
    title:
      language === "tr"
        ? "Bu aralık için kampanya bulunamadı"
        : "No campaigns were found for this range",
    description:
      language === "tr"
        ? "Seçili tarih aralığında atanmış Meta reklam hesaplarında teslim edilen kampanya bulunamadı."
        : "No campaigns delivered in the selected date range for the assigned Meta ad accounts.",
  };
}

export function getMetaPageStatusMessaging(
  status: MetaStatusResponse | undefined | null,
  language: MetaUiLanguage,
  options?: {
    readyButEmpty?: boolean;
  }
): MetaPageMessagingModel {
  const pageReadiness = getMetaPageReadiness(status);
  const readyButEmpty = options?.readyButEmpty === true;
  const currentDayDescription = status
    ? getCurrentDayDescription(status, language)
    : language === "tr"
      ? "Meta bu tarih için veriyi hâlâ hazırlıyor."
      : "Meta is still preparing data for this date.";
  const notConnectedDescription = status
    ? getNotConnectedDescription(status, language)
    : language === "tr"
      ? "Meta bağlantısı olmadan seçili tarih aralığı sunulamaz."
      : "The selected range cannot be served without a Meta connection.";

  const state: MetaPageMessagingState =
    !status?.connected || (status.assignedAccountIds?.length ?? 0) === 0 || pageReadiness?.state === "not_connected"
      ? "not_connected"
      : pageReadiness?.state === "blocked"
        ? "blocked"
        : pageReadiness?.state === "syncing"
          ? pageReadiness.selectedRangeMode === "current_day_live"
            ? "syncing_current_day"
            : "syncing_historical"
          : pageReadiness?.state === "partial"
            ? pageReadiness.selectedRangeMode === "current_day_live"
              ? "partial_current_day"
              : "partial_historical"
            : readyButEmpty
              ? "ready_empty"
              : "ready";

  switch (state) {
    case "not_connected":
      return {
        state,
        pill: {
          visible: false,
          label: language === "tr" ? "Bağlı değil" : "Not connected",
          state: "needs_attention",
          tone: "warning",
        },
        banner: {
          visible: false,
          title: null,
          description: null,
          tone: "warning",
        },
        emptyState: {
          title: language === "tr" ? "Meta bağlantısını tamamlayın" : "Finish connecting Meta",
          description: notConnectedDescription,
        },
        currentDayPreparing: {
          title: language === "tr" ? "Bugünün Meta verisi hazırlanıyor" : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel: language === "tr" ? "Meta verisi hazırlanıyor" : "Meta data is preparing",
          revenueSubLabel: language === "tr" ? "Meta verisi hazırlanıyor" : "Meta data is preparing",
          avgCpaSubLabel: language === "tr" ? "Meta verisi hazırlanıyor" : "Meta data is preparing",
          roasSubLabel: language === "tr" ? "Meta verisi hazırlanıyor" : "Meta data is preparing",
        },
      };
    case "syncing_current_day":
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Bugün hazırlanıyor" : "Preparing today",
          state: "syncing",
          tone: "info",
        },
        banner: {
          visible: true,
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: pageReadiness?.reason ?? currentDayDescription,
          tone: "info",
        },
        emptyState: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: pageReadiness?.reason ?? currentDayDescription,
        },
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: pageReadiness?.reason ?? currentDayDescription,
        },
        kpi: {
          spendSubLabel:
            language === "tr" ? "Bugünün Meta verisi hazırlanıyor" : "Current-day Meta data is preparing",
          revenueSubLabel:
            language === "tr"
              ? "Kartlar bugünün verisi geldikçe açılacak"
              : "Cards will unlock as current-day data becomes available",
          avgCpaSubLabel:
            language === "tr"
              ? "Meta günü kapanmadan dönüşümler tamamlanmayabilir"
              : "Conversions may remain incomplete until the Meta day closes",
          roasSubLabel:
            language === "tr"
              ? "Bugünün değeri Meta tamamlandıkça netleşecek"
              : "The current-day value will stabilize as Meta finishes loading",
        },
      };
    case "syncing_historical":
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Aralık hazırlanıyor" : "Preparing range",
          state: "syncing",
          tone: "info",
        },
        banner: {
          visible: true,
          title:
            language === "tr"
              ? "Seçili aralık hazırlanıyor"
              : "Selected range is preparing",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Seçili aralığın kalan yüzeyleri arka planda tamamlanıyor."
              : "The remaining selected-range surfaces continue preparing in the background."),
          tone: "info",
        },
        emptyState: {
          title:
            language === "tr"
              ? "Kampanya verileri hâlâ hazırlanıyor"
              : "Campaign data is still being prepared",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Hazır olan yüzeyleri kullanabilirsiniz; seçili aralığın geri kalanı arka planda hazırlanıyor."
              : "You can use the surfaces that are ready while the remaining selected-range surfaces keep preparing in the background."),
        },
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel:
            language === "tr" ? "Seçili aralık hazırlanıyor" : "Selected range is preparing",
          revenueSubLabel:
            language === "tr" ? "Seçili aralık hazırlanıyor" : "Selected range is preparing",
          avgCpaSubLabel:
            language === "tr" ? "Seçili aralık hazırlanıyor" : "Selected range is preparing",
          roasSubLabel:
            language === "tr" ? "Seçili aralık hazırlanıyor" : "Selected range is preparing",
        },
      };
    case "partial_current_day":
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Kısmen hazır" : "Partially ready",
          state: "syncing",
          tone: "info",
        },
        banner: {
          visible: true,
          title:
            language === "tr"
              ? "Bugünün Meta sayfası kısmen hazır"
              : "Today's Meta page is partially ready",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Hazır olan yüzeyleri kullanabilirsiniz; kalan bugünün yüzeyleri hazırlanıyor."
              : "Usable current-day surfaces are available while the remaining surfaces continue preparing."),
          tone: "info",
        },
        emptyState: {
          title:
            language === "tr"
              ? "Kampanya verileri hâlâ hazırlanıyor"
              : "Campaign data is still being prepared",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Hazır olan yüzeyleri kullanabilirsiniz; kalan bugünün yüzeyleri hazırlanıyor."
              : "Usable current-day surfaces are available while the remaining surfaces continue preparing."),
        },
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: pageReadiness?.reason ?? currentDayDescription,
        },
        kpi: {
          spendSubLabel:
            language === "tr" ? "Bugünün Meta verisi hazırlanıyor" : "Current-day Meta data is preparing",
          revenueSubLabel:
            language === "tr"
              ? "Kartlar bugünün verisi geldikçe açılacak"
              : "Cards will unlock as current-day data becomes available",
          avgCpaSubLabel:
            language === "tr"
              ? "Meta günü kapanmadan dönüşümler tamamlanmayabilir"
              : "Conversions may remain incomplete until the Meta day closes",
          roasSubLabel:
            language === "tr"
              ? "Bugünün değeri Meta tamamlandıkça netleşecek"
              : "The current-day value will stabilize as Meta finishes loading",
        },
      };
    case "partial_historical":
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Kısmen hazır" : "Partially ready",
          state: "syncing",
          tone: "info",
        },
        banner: {
          visible: true,
          title:
            language === "tr"
              ? "Meta sayfası kısmen hazır"
              : "Meta page is partially ready",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Hazır olan yüzeyleri kullanabilirsiniz; kalan gerekli yüzeyler arka planda hazırlanıyor."
              : "You can use the surfaces that are ready while the remaining required surfaces continue in the background."),
          tone: "info",
        },
        emptyState: {
          title:
            language === "tr"
              ? "Kampanya verileri hâlâ hazırlanıyor"
              : "Campaign data is still being prepared",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Hazır olan yüzeyleri kullanabilirsiniz; kalan gerekli yüzeyler arka planda hazırlanıyor."
              : "You can use the surfaces that are ready while the remaining required surfaces continue in the background."),
        },
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel:
            language === "tr" ? "Seçili aralık kısmen hazır" : "Selected range is partially ready",
          revenueSubLabel:
            language === "tr" ? "Seçili aralık kısmen hazır" : "Selected range is partially ready",
          avgCpaSubLabel:
            language === "tr" ? "Seçili aralık kısmen hazır" : "Selected range is partially ready",
          roasSubLabel:
            language === "tr" ? "Seçili aralık kısmen hazır" : "Selected range is partially ready",
        },
      };
    case "blocked":
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Müdahale gerekiyor" : "Needs attention",
          state: "needs_attention",
          tone: "warning",
        },
        banner: {
          visible: true,
          title:
            language === "tr"
              ? "Seçili aralık şu anda bloklu"
              : "The selected range is currently blocked",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Seçili tarih aralığı gerekli Meta yüzeylerini şu anda sağlayamıyor."
              : "The selected date range cannot currently satisfy the required Meta surfaces."),
          tone: "warning",
        },
        emptyState: {
          title:
            language === "tr"
              ? "Seçili aralık şu anda bloklu"
              : "The selected range is currently blocked",
          description:
            pageReadiness?.reason ??
            (language === "tr"
              ? "Seçili tarih aralığı gerekli Meta yüzeylerini şu anda sağlayamıyor."
              : "The selected date range cannot currently satisfy the required Meta surfaces."),
        },
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel:
            language === "tr" ? "Seçili aralık bloklu" : "Selected range is blocked",
          revenueSubLabel:
            language === "tr" ? "Seçili aralık bloklu" : "Selected range is blocked",
          avgCpaSubLabel:
            language === "tr" ? "Seçili aralık bloklu" : "Selected range is blocked",
          roasSubLabel:
            language === "tr" ? "Seçili aralık bloklu" : "Selected range is blocked",
        },
      };
    case "ready_empty": {
      const readyEmpty = getReadyEmptyCopy(language);
      return {
        state,
        pill: {
          visible: true,
          label: language === "tr" ? "Aktif" : "Active",
          state: "active",
          tone: "success",
        },
        banner: {
          visible: false,
          title: null,
          description: null,
          tone: "success",
        },
        emptyState: readyEmpty,
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel: language === "tr" ? "0 kampanya" : "0 campaigns",
          revenueSubLabel: language === "tr" ? "Atfedilen purchase'lar" : "Attributed purchases",
          avgCpaSubLabel: language === "tr" ? "Dönüşüm başı maliyet" : "Cost per conversion",
          roasSubLabel: language === "tr" ? "Tüm kampanyalar birleşik" : "All campaigns combined",
        },
      };
    }
    case "ready":
    default:
      return {
        state: "ready",
        pill: {
          visible: true,
          label: language === "tr" ? "Aktif" : "Active",
          state: "active",
          tone: "success",
        },
        banner: {
          visible: false,
          title: null,
          description: null,
          tone: "success",
        },
        emptyState: getReadyEmptyCopy(language),
        currentDayPreparing: {
          title:
            language === "tr"
              ? "Bugünün Meta verisi hazırlanıyor"
              : "Current-day Meta data is preparing",
          description: currentDayDescription,
        },
        kpi: {
          spendSubLabel: language === "tr" ? "Kampanyalar" : "Campaigns",
          revenueSubLabel: language === "tr" ? "Atfedilen purchase'lar" : "Attributed purchases",
          avgCpaSubLabel: language === "tr" ? "Dönüşüm başı maliyet" : "Cost per conversion",
          roasSubLabel: language === "tr" ? "Tüm kampanyalar birleşik" : "All campaigns combined",
        },
      };
  }
}
