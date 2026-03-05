export enum Platform {
  SHOPIFY = "shopify",
  META = "meta",
  GOOGLE = "google",
  TIKTOK = "tiktok",
  PINTEREST = "pinterest",
  SNAPCHAT = "snapchat",
}

export enum IntegrationStatus {
  DISCONNECTED = "disconnected",
  CONNECTED = "connected",
  ERROR = "error",
}

export enum PlatformLevel {
  ACCOUNT = "account",
  CAMPAIGN = "campaign",
  AD_SET = "adSet",
  AD = "ad",
  CREATIVE = "creative",
}

export interface DateRange {
  startDate: string;
  endDate: string;
}
