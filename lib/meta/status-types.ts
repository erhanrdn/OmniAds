export interface MetaSyncDetails {
  id?: string | null;
  status?: string;
  syncType?: string | null;
  scope?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  triggerSource?: string | null;
  triggeredAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
  progressPercent?: number | null;
  completedDays?: number | null;
  totalDays?: number | null;
  readyThroughDate?: string | null;
  phaseLabel?: string | null;
}

export interface MetaStatusResponse {
  state:
    | "not_connected"
    | "connected_no_assignment"
    | "syncing"
    | "partial"
    | "action_required"
    | "ready";
  connected: boolean;
  assignedAccountIds: string[];
  primaryAccountTimezone?: string | null;
  currentDateInTimezone?: string | null;
  needsBootstrap?: boolean;
  warehouse?: {
    rowCount: number;
    firstDate: string | null;
    lastDate: string | null;
    coverage?: {
      accountDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      adsetDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      breakdowns?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      creatives?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      pendingSurfaces?: string[];
    } | null;
  } | null;
  latestSync?: MetaSyncDetails | null;
}
