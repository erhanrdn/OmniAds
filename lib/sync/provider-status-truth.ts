export interface ProviderRequiredCoverage {
  completedDays: number;
  totalDays: number;
  percent: number;
  readyThroughDate: string | null;
  complete: boolean;
}

export interface ProviderSecondaryReadiness {
  key: string;
  state: "ready" | "building" | "blocked";
  detail: string;
}

export interface ProviderBlockingReason {
  code: string;
  detail: string;
  repairable: boolean;
}

export interface ProviderRepairableAction {
  kind: string;
  detail: string;
  available: boolean;
}

export function buildRequiredCoverage(input: {
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
}): ProviderRequiredCoverage {
  const totalDays = Math.max(0, input.totalDays);
  const completedDays = Math.max(0, Math.min(input.completedDays, totalDays));
  const percent =
    totalDays > 0 ? Math.max(0, Math.min(100, Math.round((completedDays / totalDays) * 100))) : 0;
  return {
    completedDays,
    totalDays,
    percent,
    readyThroughDate: input.readyThroughDate,
    complete: totalDays > 0 && completedDays >= totalDays,
  };
}

export function buildBlockingReason(
  code: string,
  detail: string,
  options?: { repairable?: boolean }
): ProviderBlockingReason {
  return {
    code,
    detail,
    repairable: options?.repairable ?? false,
  };
}

export function buildRepairableAction(
  kind: string,
  detail: string,
  options?: { available?: boolean }
): ProviderRepairableAction {
  return {
    kind,
    detail,
    available: options?.available ?? true,
  };
}

export function compactBlockingReasons(
  reasons: Array<ProviderBlockingReason | null | false | undefined>
): ProviderBlockingReason[] {
  const seen = new Set<string>();
  const rows: ProviderBlockingReason[] = [];
  for (const reason of reasons) {
    if (!reason) continue;
    const key = `${reason.code}:${reason.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(reason);
  }
  return rows;
}

export function compactRepairableActions(
  actions: Array<ProviderRepairableAction | null | false | undefined>
): ProviderRepairableAction[] {
  const seen = new Set<string>();
  const rows: ProviderRepairableAction[] = [];
  for (const action of actions) {
    if (!action) continue;
    const key = `${action.kind}:${action.detail}:${action.available}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(action);
  }
  return rows;
}
