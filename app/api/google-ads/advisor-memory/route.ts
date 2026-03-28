import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getAdvisorExecutionCalibration,
  logAdvisorExecutionEvent,
  updateAdvisorCompletionState,
  updateAdvisorExecutionState,
  updateAdvisorMemoryAction,
} from "@/lib/google-ads/advisor-memory";
import { executeAdvisorMutation, rollbackAdvisorMutation } from "@/lib/google-ads/advisor-mutate";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        businessId?: string;
        accountId?: string;
        recommendationFingerprint?: string;
        action?: "dismissed" | "ignored" | "applied" | "unsuppress";
        executionAction?: "apply_mutate" | "rollback_mutate" | "mark_completion";
        batchExecutionAction?: "apply_batch_mutate";
        mutateActionType?: "add_negative_keyword" | "pause_asset" | "pause_ad" | "adjust_campaign_budget" | null;
        mutatePayloadPreview?: Record<string, unknown> | null;
        rollbackActionType?: "remove_negative_keyword" | "enable_asset" | "enable_ad" | "restore_campaign_budget" | null;
        rollbackPayloadPreview?: Record<string, unknown> | null;
        executionTrustBand?: "low" | "medium" | "high" | null;
        dependencyReadiness?: "not_ready" | "done_unverified" | "done_trusted" | "done_degraded" | null;
        stabilizationHoldUntil?: string | null;
        completionMode?: "full" | "partial" | "unknown";
        completedStepCount?: number | null;
        totalStepCount?: number | null;
        completedStepIds?: string[] | null;
        skippedStepIds?: string[] | null;
        coreStepIds?: string[] | null;
        batchItems?: Array<{
          recommendationFingerprint: string;
          accountId: string;
          mutateActionType: "add_negative_keyword" | "pause_asset";
          mutatePayloadPreview: Record<string, unknown>;
          rollbackActionType?: "remove_negative_keyword" | "enable_asset" | null;
          rollbackPayloadPreview?: Record<string, unknown> | null;
          executionTrustBand?: "low" | "medium" | "high" | null;
          batchGroupKey?: string | null;
        }> | null;
        dismissReason?: string | null;
        suppressUntil?: string | null;
      }
    | null;

  const businessId = body?.businessId ?? null;
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "collaborator" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (!body?.recommendationFingerprint) {
    return NextResponse.json(
      { error: "recommendationFingerprint is required" },
      { status: 400 }
    );
  }

  const accountId = body.accountId ?? "all";

  if (body.batchExecutionAction === "apply_batch_mutate") {
    const items = Array.isArray(body.batchItems) ? body.batchItems : [];
    if (items.length === 0 || items.length > 5) {
      return NextResponse.json({ error: "batchItems must contain between 1 and 5 items" }, { status: 400 });
    }
    const actionTypes = new Set(items.map((item) => item.mutateActionType));
    const batchGroups = new Set(items.map((item) => String(item.batchGroupKey ?? "")));
    if (actionTypes.size !== 1 || batchGroups.size !== 1) {
      return NextResponse.json({ error: "Batch mutate only supports same action type and same batch group." }, { status: 400 });
    }
    const unsupported = items.some((item) => item.mutateActionType !== "add_negative_keyword");
    if (unsupported) {
      return NextResponse.json({ error: "Wave 9 batch mutate only supports add_negative_keyword." }, { status: 400 });
    }
    const results: Array<{ recommendationFingerprint: string; ok: boolean; error?: string | null }> = [];
    for (const item of items) {
      await updateAdvisorExecutionState({
        businessId,
        accountId: item.accountId,
        recommendationFingerprint: item.recommendationFingerprint,
        executionStatus: "pending",
        executionError: null,
      });
      await logAdvisorExecutionEvent({
        businessId,
        accountId: item.accountId,
        recommendationFingerprint: item.recommendationFingerprint,
        mutateActionType: item.mutateActionType,
        operation: "apply",
        status: "pending",
        payload: item.mutatePayloadPreview,
      });
      try {
        const result = await executeAdvisorMutation({
          businessId,
          accountId: item.accountId,
          action: {
            actionType: item.mutateActionType,
            payload: item.mutatePayloadPreview as never,
          },
        });
        const rollbackPayloadPreview =
          item.rollbackActionType === "remove_negative_keyword"
            ? { resourceNames: result.resourceNames }
            : item.rollbackPayloadPreview ?? null;
        await updateAdvisorExecutionState({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          executionStatus: "applied",
          rollbackAvailable: Boolean(item.rollbackActionType),
          executionMetadata: {
            mutateActionType: item.mutateActionType,
            rollbackActionType: item.rollbackActionType ?? null,
            rollbackPayloadPreview,
            resourceNames: result.resourceNames,
            policyPatternKey: item.mutatePayloadPreview?.policyPatternKey ?? null,
            executionTrustBand: item.executionTrustBand ?? null,
            batchGroupKey: item.batchGroupKey ?? null,
          },
        });
        await updateAdvisorMemoryAction({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          action: "applied",
        });
        await updateAdvisorCompletionState({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          completionMode: "full",
          completedStepCount: 1,
          totalStepCount: 1,
          completedStepIds: ["execute_mutate"],
          skippedStepIds: [],
          coreStepIds: ["execute_mutate"],
        });
        await logAdvisorExecutionEvent({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          mutateActionType: item.mutateActionType,
          operation: "apply",
          status: "applied",
          payload: item.mutatePayloadPreview,
          response: { resourceNames: result.resourceNames, batchGroupKey: item.batchGroupKey ?? null },
        });
        results.push({ recommendationFingerprint: item.recommendationFingerprint, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Batch mutate failed.";
        await updateAdvisorExecutionState({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          executionStatus: "failed",
          executionError: message,
        });
        await logAdvisorExecutionEvent({
          businessId,
          accountId: item.accountId,
          recommendationFingerprint: item.recommendationFingerprint,
          mutateActionType: item.mutateActionType,
          operation: "apply",
          status: "failed",
          payload: item.mutatePayloadPreview,
          errorMessage: message,
        });
        results.push({ recommendationFingerprint: item.recommendationFingerprint, ok: false, error: message });
      }
    }
    return NextResponse.json({ ok: true, results });
  }

  if (body.executionAction === "apply_mutate") {
    if (!body.mutateActionType || !body.mutatePayloadPreview || !body.accountId || body.accountId === "all") {
      return NextResponse.json({ error: "accountId, mutateActionType and mutatePayloadPreview are required" }, { status: 400 });
    }
    if (body.executionTrustBand === "low") {
      return NextResponse.json({ error: "Execution policy trust is too low for native mutate." }, { status: 400 });
    }
    if (body.dependencyReadiness === "not_ready" || body.dependencyReadiness === "done_degraded") {
      return NextResponse.json({ error: "Prerequisite execution state is no longer valid for native mutate." }, { status: 400 });
    }
    if (body.stabilizationHoldUntil && new Date(body.stabilizationHoldUntil).getTime() > Date.now()) {
      return NextResponse.json({ error: `This mutate remains in stabilization hold until ${body.stabilizationHoldUntil}.` }, { status: 400 });
    }
    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: body.recommendationFingerprint,
      executionStatus: "pending",
      executionError: null,
    });
    await logAdvisorExecutionEvent({
      businessId,
      accountId,
      recommendationFingerprint: body.recommendationFingerprint,
      mutateActionType: body.mutateActionType,
      operation: "apply",
      status: "pending",
      payload: body.mutatePayloadPreview,
    });
    try {
      const result = await executeAdvisorMutation({
        businessId,
        accountId,
        action: {
          actionType: body.mutateActionType,
          payload: body.mutatePayloadPreview as never,
        },
      });
      const rollbackPayloadPreview =
        body.rollbackActionType === "remove_negative_keyword"
          ? { resourceNames: result.resourceNames }
          : body.rollbackActionType === "enable_asset"
            ? { resourceName: result.resourceNames[0] ?? body.rollbackPayloadPreview?.resourceName ?? null }
            : body.rollbackActionType === "restore_campaign_budget"
              ? {
                  campaignBudgetResourceName:
                    body.rollbackPayloadPreview?.campaignBudgetResourceName ??
                    result.resourceNames[0] ??
                    null,
                  previousAmount: body.rollbackPayloadPreview?.previousAmount ?? null,
                }
            : body.rollbackPayloadPreview ?? null;
      await updateAdvisorExecutionState({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        executionStatus: "applied",
        rollbackAvailable: Boolean(body.rollbackActionType),
        executionMetadata: {
          mutateActionType: body.mutateActionType,
          rollbackActionType: body.rollbackActionType ?? null,
          rollbackPayloadPreview,
          resourceNames: result.resourceNames,
          policyPatternKey: body.mutatePayloadPreview?.policyPatternKey ?? null,
          executionTrustBand: body.executionTrustBand ?? null,
          dependencyReadiness: body.dependencyReadiness ?? null,
        },
      });
      await updateAdvisorMemoryAction({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        action: "applied",
      });
      await updateAdvisorCompletionState({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        completionMode: "full",
        completedStepCount: 1,
        totalStepCount: 1,
        completedStepIds: body.completedStepIds ?? ["execute_mutate"],
        skippedStepIds: body.skippedStepIds ?? [],
        coreStepIds: body.coreStepIds ?? ["execute_mutate"],
      });
      await logAdvisorExecutionEvent({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        mutateActionType: body.mutateActionType,
        operation: "apply",
        status: "applied",
        payload: body.mutatePayloadPreview,
        response: { resourceNames: result.resourceNames },
      });
      return NextResponse.json({ ok: true, executionStatus: "applied", rollbackPayloadPreview });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mutate failed.";
      await updateAdvisorExecutionState({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        executionStatus: "failed",
        executionError: message,
      });
      await logAdvisorExecutionEvent({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        mutateActionType: body.mutateActionType,
        operation: "apply",
        status: "failed",
        payload: body.mutatePayloadPreview,
        errorMessage: message,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.executionAction === "rollback_mutate") {
    if (!body.rollbackActionType || !body.rollbackPayloadPreview || !body.accountId || body.accountId === "all") {
      return NextResponse.json({ error: "accountId, rollbackActionType and rollbackPayloadPreview are required" }, { status: 400 });
    }
    try {
      const response = await rollbackAdvisorMutation({
        businessId,
        accountId,
        actionType: body.rollbackActionType,
        payload: body.rollbackPayloadPreview,
      });
      await updateAdvisorExecutionState({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        executionStatus: "rolled_back",
        rollbackAvailable: false,
        rollbackExecutedAt: new Date().toISOString(),
        executionMetadata: {
          rolledBack: true,
        },
      });
      await logAdvisorExecutionEvent({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        mutateActionType: body.rollbackActionType,
        operation: "rollback",
        status: "rolled_back",
        payload: body.rollbackPayloadPreview,
        response,
      });
      return NextResponse.json({ ok: true, executionStatus: "rolled_back" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rollback failed.";
      await updateAdvisorExecutionState({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        executionStatus: "failed",
        executionError: message,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.executionAction === "mark_completion") {
    await updateAdvisorCompletionState({
      businessId,
      accountId,
      recommendationFingerprint: body.recommendationFingerprint,
      completionMode: body.completionMode ?? "unknown",
      completedStepCount: body.completedStepCount ?? null,
      totalStepCount: body.totalStepCount ?? null,
      completedStepIds: body.completedStepIds ?? null,
      skippedStepIds: body.skippedStepIds ?? null,
      coreStepIds: body.coreStepIds ?? null,
    });
    if (body.completionMode === "full" || body.completionMode === "partial") {
      await updateAdvisorMemoryAction({
        businessId,
        accountId,
        recommendationFingerprint: body.recommendationFingerprint,
        action: "applied",
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body?.action) {
    return NextResponse.json(
      { error: "action or executionAction is required" },
      { status: 400 }
    );
  }

  await updateAdvisorMemoryAction({
    businessId,
    accountId,
    recommendationFingerprint: body.recommendationFingerprint,
    action: body.action,
    dismissReason: body.dismissReason ?? null,
    suppressUntil: body.suppressUntil ?? null,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const access = await requireBusinessAccess({ request, businessId, minRole: "collaborator" });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({ ok: true, demo: true, calibration: null });
  }
  const calibration = await getAdvisorExecutionCalibration({
    businessId,
    accountId,
  });
  return NextResponse.json({ ok: true, calibration });
}
