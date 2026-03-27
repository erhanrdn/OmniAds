export interface GoogleAdsSyncDetails {
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

export interface GoogleAdsStatusResponse {
  state:
    | "not_connected"
    | "connected_no_assignment"
    | "syncing"
    | "paused"
    | "partial"
    | "stale"
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
      historical?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      selectedRange?: {
        startDate: string;
        endDate: string;
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        isComplete: boolean;
      } | null;
      accountDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      campaignDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      scopes?: Array<{
        scope: string;
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        latestBackgroundActivityAt: string | null;
        deadLetterCount: number;
      }> | null;
      pendingSurfaces?: string[];
    } | null;
  } | null;
  advisor?: {
    ready: boolean;
    requiredSurfaces: string[];
    availableSurfaces: string[];
    missingSurfaces: string[];
    readyRangeStart: string | null;
    readyRangeEnd: string | null;
  } | null;
  jobHealth?: {
    runningJobs: number;
    staleRunningJobs: number;
    backgroundRunningJobs?: number;
    priorityRunningJobs?: number;
    legacyRuntimeJobs?: number;
    queueDepth?: number;
    leasedPartitions?: number;
    coreQueueDepth?: number;
    coreLeasedPartitions?: number;
    extendedQueueDepth?: number;
    extendedLeasedPartitions?: number;
    maintenanceQueueDepth?: number;
    maintenanceLeasedPartitions?: number;
    deadLetterPartitions?: number;
    oldestQueuedPartition?: string | null;
  } | null;
  priorityWindow?: {
    startDate: string;
    endDate: string;
    completedDays: number;
    totalDays: number;
    isActive: boolean;
  } | null;
  latestSync?: GoogleAdsSyncDetails | null;
}
