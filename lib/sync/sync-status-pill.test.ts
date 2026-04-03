import { describe, expect, it } from "vitest";
import {
  resolveGoogleAdsSyncStatusPill,
  resolveMetaSyncStatusPill,
} from "@/lib/sync/sync-status-pill";

describe("sync status pill resolver", () => {
  it("renders a syncing pill for Meta when progress is visible", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "syncing",
        latestSync: { progressPercent: 82 },
      } as never)
    ).toMatchObject({
      label: "82% Syncing",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders an active pill for ready Meta", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "ready",
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders an attention pill for Meta blockers without reliable progress", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "paused",
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("prefers Meta attention state over 100 percent progress", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "stale",
        latestSync: { progressPercent: 100 },
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("renders an active pill for Meta when core progress is complete despite background backlog", () => {
    expect(
      resolveMetaSyncStatusPill({
        connected: true,
        assignedAccountIds: ["act_1"],
        state: "syncing",
        latestSync: { progressPercent: 100 },
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders a syncing pill for Google Ads when advisor progress is visible", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "syncing",
        advisorProgress: {
          visible: true,
          percent: 64,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "64% Syncing",
      tone: "info",
      state: "syncing",
    });
  });

  it("renders an active pill for ready Google Ads", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "ready",
      } as never)
    ).toMatchObject({
      label: "Active",
      tone: "success",
      state: "active",
    });
  });

  it("renders an attention pill for stale Google Ads status", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "stale",
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });

  it("prefers Google Ads attention state over 100 percent progress", () => {
    expect(
      resolveGoogleAdsSyncStatusPill({
        connected: true,
        assignedAccountIds: ["acc_1"],
        state: "advisor_not_ready",
        advisorProgress: {
          visible: true,
          percent: 100,
          summary: "Preparing",
        },
      } as never)
    ).toMatchObject({
      label: "Needs attention",
      tone: "warning",
      state: "needs_attention",
    });
  });
});
