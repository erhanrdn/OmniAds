import { IntegrationStatus, Platform } from "@/src/types/platform";

export interface MetricsRow {
  impressions: number;
  clicks: number;
  purchases: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface Account {
  id: string;
  businessId: string;
  platform: Platform;
  name: string;
  currency: string;
  status: "active" | "paused";
}

export interface Campaign {
  id: string;
  accountId: string;
  platform: Platform;
  name: string;
  objective: string;
  status: "active" | "paused";
}

export interface AdSet {
  id: string;
  campaignId: string;
  platform: Platform;
  name: string;
  audience: string;
  status: "active" | "paused";
}

export interface Ad {
  id: string;
  adSetId: string;
  platform: Platform;
  name: string;
  format: string;
  status: "active" | "paused";
}

export interface Creative {
  id: string;
  businessId: string;
  platform: Platform;
  name: string;
  format: "image" | "video";
  status: "active" | "archived";
  primaryText: string;
  headline: string;
  cta: string;
  landingPageUrl: string;
  thumbnailUrl: string;
  createdAt: string;
  metrics: {
    spend: number;
    purchases: number;
    revenue: number;
    ctr: number;
    roas: number;
  };
  seenIn: {
    campaigns: string[];
    adSets: string[];
    ads: string[];
  };
}

export interface LandingPage {
  id: string;
  businessId: string;
  name: string;
  platform: Platform;
  url: string;
  utmPlaceholder: string;
  status: "active" | "draft";
  clicks: number;
  sessions: number;
  purchases: number;
  revenue: number;
  roas: number;
  conversionRate: number;
  updatedAt: string;
  topCreatives: string[];
  topCopies: string[];
}

export interface Copy {
  id: string;
  businessId: string;
  platform: Platform;
  objective: "awareness" | "traffic" | "conversions";
  headline: string;
  snippet: string;
  body: string;
  fullText: string;
  status: "approved" | "draft";
  language: string;
  usageCount: number;
  spend: number;
  roas: number;
  ctr: number;
  usedIn: {
    campaigns: string[];
    ads: string[];
  };
  similarCopies: string[];
  updatedAt: string;
}

export interface PlatformTableRow {
  id: string;
  name: string;
  level: "account" | "campaign" | "adSet" | "ad" | "creative";
  status: "active" | "paused";
  platform: Platform;
  accountId: string;
  metrics: Partial<MetricsRow>;
}

export interface IntegrationConnection {
  id: string;
  businessId: string;
  platform: Platform;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  message?: string;
}

export interface OverviewData {
  businessId: string;
  dateRange: { startDate: string; endDate: string };
  totals: MetricsRow;
  kpis: {
    spend: number;
    revenue: number;
    roas: number;
    purchases: number;
    cpa: number;
    aov: number;
  };
  platformEfficiency: Array<{
    platform: Platform;
    spend: number;
    revenue: number;
    roas: number;
    purchases: number;
    cpa: number;
  }>;
  trends: {
    "7d": Array<{
      label: string;
      spend: number;
      revenue: number;
      purchases: number;
    }>;
    "30d": Array<{
      label: string;
      spend: number;
      revenue: number;
      purchases: number;
    }>;
    custom: Array<{
      label: string;
      spend: number;
      revenue: number;
      purchases: number;
    }>;
  };
  platformBreakdown: Array<{
    platform: Platform;
    spend: number;
    revenue: number;
    roas: number;
  }>;
}
