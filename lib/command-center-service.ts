import type { NextRequest } from "next/server";
import type { CommandCenterPermissions, CommandCenterResponse } from "@/lib/command-center";
import {
  COMMAND_CENTER_CONTRACT_VERSION,
  applyCommandCenterQueueSelection,
  aggregateCommandCenterActions,
  buildCommandCenterDefaultQueueSummary,
  buildCommandCenterFiltersFromViewKey,
  buildCommandCenterOwnerWorkload,
  buildCommandCenterShiftDigest,
  buildCommandCenterViewStacks,
  compareCommandCenterActions,
  decorateCommandCenterActionsWithThroughput,
  filterCommandCenterActionsByView,
  summarizeCommandCenterFeedback,
  summarizeCommandCenterActions,
} from "@/lib/command-center";
import {
  listAssignableCommandCenterUsers,
  listCommandCenterActionStates,
  listCommandCenterFeedback,
  listCommandCenterHandoffs,
  listCommandCenterJournal,
  listCommandCenterSavedViews,
} from "@/lib/command-center-store";
import { buildCommandCenterHistoricalIntelligence } from "@/lib/command-center-historical-intelligence";
import { getCreativeDecisionOsForRange } from "@/lib/creative-decision-os-source";
import { isCreativeDecisionOsV1EnabledForBusiness } from "@/lib/creative-decision-os-config";
import { getMetaCampaignsForRange } from "@/lib/meta/campaigns-source";
import { getMetaDecisionWindowContext } from "@/lib/meta/operator-decision-source";
import { getMetaDecisionOsForRange } from "@/lib/meta/decision-os-source";
import { isMetaDecisionOsV1EnabledForBusiness } from "@/lib/meta/decision-os-config";

export async function getCommandCenterSnapshot(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
  activeViewKey?: string | null;
  permissions: CommandCenterPermissions;
}): Promise<CommandCenterResponse> {
  const [
    decisionContext,
    metaDecisionOs,
    creativeDecisionOs,
    actionStates,
    savedViews,
    journal,
    handoffs,
    feedback,
    assignableUsers,
    selectedPeriodCampaigns,
  ] = await Promise.all([
    getMetaDecisionWindowContext({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    isMetaDecisionOsV1EnabledForBusiness(input.businessId)
      ? getMetaDecisionOsForRange({
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
        })
      : Promise.resolve(null),
    isCreativeDecisionOsV1EnabledForBusiness(input.businessId)
      ? getCreativeDecisionOsForRange({
          request: input.request,
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
        })
      : Promise.resolve(null),
    listCommandCenterActionStates(input.businessId),
    listCommandCenterSavedViews(input.businessId),
    listCommandCenterJournal({ businessId: input.businessId, limit: 60 }),
    listCommandCenterHandoffs({ businessId: input.businessId, limit: 20 }),
    listCommandCenterFeedback({ businessId: input.businessId, limit: 50 }),
    listAssignableCommandCenterUsers(input.businessId),
    getMetaCampaignsForRange({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => ({
      status: "not_connected" as const,
      rows: [],
      isPartial: true,
      notReadyReason: "Selected-period Meta campaign analysis is unavailable.",
    })),
  ]);

  const aggregatedActions = aggregateCommandCenterActions({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    metaDecisionOs,
    creativeDecisionOs,
    stateByFingerprint: actionStates,
  });
  const throughputDecoratedActions = decorateCommandCenterActionsWithThroughput({
    actions: aggregatedActions,
    decisionAsOf: decisionContext.decisionAsOf,
  }).sort(compareCommandCenterActions);
  const throughput = buildCommandCenterDefaultQueueSummary(
    throughputDecoratedActions,
  );
  const allActions = applyCommandCenterQueueSelection({
    actions: throughputDecoratedActions,
    throughput,
  });
  const ownerWorkload = buildCommandCenterOwnerWorkload({
    actions: allActions,
    throughput,
  });
  const feedbackSummary = summarizeCommandCenterFeedback(feedback);
  const shiftDigest = buildCommandCenterShiftDigest({
    throughput,
    actions: allActions,
    ownerWorkload,
    feedbackSummary,
  });
  const historicalIntelligence = buildCommandCenterHistoricalIntelligence({
    startDate: input.startDate,
    endDate: input.endDate,
    selectedPeriodCampaigns: selectedPeriodCampaigns.rows ?? [],
    actions: allActions,
    throughput,
    feedbackSummary,
    feedback,
    metaDecisionOs,
    creativeDecisionOs,
  });
  const viewStacks = buildCommandCenterViewStacks(savedViews);

  const viewDefinition = buildCommandCenterFiltersFromViewKey(
    input.businessId,
    input.activeViewKey,
    savedViews,
  );
  const visibleActions = viewDefinition
    ? filterCommandCenterActionsByView(allActions, viewDefinition)
    : allActions;

  return {
    contractVersion: COMMAND_CENTER_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionContext.analyticsWindow,
    decisionWindows: decisionContext.decisionWindows,
    historicalMemory: decisionContext.historicalMemory,
    decisionAsOf: decisionContext.decisionAsOf,
    activeViewKey: input.activeViewKey ?? null,
    permissions: input.permissions,
    summary: summarizeCommandCenterActions(allActions),
    throughput,
    ownerWorkload,
    shiftDigest,
    viewStacks,
    feedbackSummary,
    historicalIntelligence,
    actions: visibleActions,
    savedViews,
    journal,
    handoffs,
    feedback,
    assignableUsers,
  };
}

export async function findCommandCenterActionForRange(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
  actionFingerprint: string;
  permissions: CommandCenterPermissions;
}) {
  const snapshot = await getCommandCenterSnapshot({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    permissions: input.permissions,
  });
  return (
    snapshot.actions.find(
      (action) => action.actionFingerprint === input.actionFingerprint,
    ) ?? null
  );
}
