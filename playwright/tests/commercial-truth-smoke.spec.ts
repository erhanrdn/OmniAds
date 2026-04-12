import { expect, test, type Page } from "@playwright/test";

const STANDARD_DATE_RANGE = {
  rangePreset: "30d",
  customStart: "",
  customEnd: "",
  comparisonPreset: "none",
  comparisonStart: "",
  comparisonEnd: "",
} as const;

const BROWSER_DECISION_RANGES = [
  {
    label: "last 30d",
    standard: STANDARD_DATE_RANGE,
    creative: {
      preset: "last30Days",
      customStart: "",
      customEnd: "",
      lastDays: 30,
      sinceDate: "",
    },
  },
  {
    label: "today",
    standard: {
      rangePreset: "today",
      customStart: "",
      customEnd: "",
      comparisonPreset: "none",
      comparisonStart: "",
      comparisonEnd: "",
    },
    creative: {
      preset: "today",
      customStart: "",
      customEnd: "",
      lastDays: 30,
      sinceDate: "",
    },
  },
  {
    label: "last 7d",
    standard: {
      rangePreset: "7d",
      customStart: "",
      customEnd: "",
      comparisonPreset: "none",
      comparisonStart: "",
      comparisonEnd: "",
    },
    creative: {
      preset: "last7Days",
      customStart: "",
      customEnd: "",
      lastDays: 30,
      sinceDate: "",
    },
  },
  {
    label: "previous month",
    standard: {
      rangePreset: "lastMonth",
      customStart: "",
      customEnd: "",
      comparisonPreset: "none",
      comparisonStart: "",
      comparisonEnd: "",
    },
    creative: {
      preset: "lastMonth",
      customStart: "",
      customEnd: "",
      lastDays: 30,
      sinceDate: "",
    },
  },
  {
    label: "custom past range",
    standard: {
      rangePreset: "custom",
      customStart: "2026-02-01",
      customEnd: "2026-02-10",
      comparisonPreset: "none",
      comparisonStart: "",
      comparisonEnd: "",
    },
    creative: {
      preset: "custom",
      customStart: "2026-02-01",
      customEnd: "2026-02-10",
      lastDays: 30,
      sinceDate: "",
    },
  },
] as const;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function setStoredDateRange(
  page: Page,
  key: "metaDateRange" | "commandCenterDateRange" | "creativeDateRange",
  value: Record<string, unknown>,
) {
  await page.evaluate(({ key, value }) => {
    const storageKey = "omniads-preferences-store-v1";
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = {
      ...(parsed.state ?? {}),
      [key]: value,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(parsed));
  }, { key, value });
}

async function captureMetaDecisionSignature(
  page: Page,
) {
  return {
    operatingMode: normalizeText(
      await page.getByTestId("meta-operating-mode-card").textContent(),
    ),
    decisionOs: normalizeText(
      await page.getByTestId("meta-decision-os-overview").textContent(),
    ),
    topActions: normalizeText(
      await page.getByTestId("meta-top-adset-actions").textContent(),
    ),
  };
}

async function captureCommandCenterDecisionSignature(
  page: Page,
) {
  const budgetSummary = normalizeText(
    await page.getByTestId("command-center-budget-summary").textContent(),
  );
  const shiftDigest = normalizeText(
    await page.getByTestId("command-center-shift-digest").textContent(),
  );
  const cards = page.locator('[data-testid^="command-center-action-"]');
  const count = Math.min(await cards.count(), 3);
  const entries: string[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(normalizeText(await cards.nth(index).textContent()));
  }
  return {
    budgetSummary,
    shiftDigest,
    entries,
  };
}

async function captureCommandCenterHistoricalSignature(page: Page) {
  return normalizeText(
    await page.getByTestId("command-center-historical-intelligence").textContent(),
  );
}

async function captureCreativeDecisionSignature(
  page: Page,
) {
  const drawer = page.getByTestId("creative-decision-os-drawer");
  const alreadyOpen = await drawer.isVisible().catch(() => false);
  if (!alreadyOpen) {
    await page.getByRole("button", { name: "Creative Decision OS" }).click();
  }
  await expect(page.getByTestId("creative-decision-os-drawer")).toBeVisible();
  return {
    overview: normalizeText(
      await page.getByTestId("creative-decision-os-overview").textContent(),
    ),
    lifecycle: normalizeText(
      await page.getByTestId("creative-lifecycle-board").textContent(),
    ),
    queues: normalizeText(
      await page.getByTestId("creative-operator-queues").textContent(),
    ),
  };
}

async function captureCreativeHistoricalSignature(page: Page) {
  return normalizeText(
    await page.getByTestId("creative-historical-analysis").textContent(),
  );
}

async function commandCenterViewCandidates(page: Page) {
  const candidates = [page.getByRole("button", { name: "Default queue", exact: true })];
  const savedViews = page.locator('[data-testid^="command-center-view-"]');
  const savedViewCount = await savedViews.count();
  for (let index = 0; index < savedViewCount; index += 1) {
    candidates.push(savedViews.nth(index));
  }
  return candidates;
}

async function selectFirstCommandCenterViewWithActions(page: Page) {
  const viewCandidates = await commandCenterViewCandidates(page);

  for (const candidate of viewCandidates) {
    await candidate.click();
    const queueActions = page.locator('[data-testid^="command-center-action-"]');
    if ((await queueActions.count()) > 0) {
      return queueActions;
    }
  }

  throw new Error("No Command Center action cards were visible in any fallback view.");
}

async function selectFirstCommandCenterViewWithBatchReadyActions(page: Page) {
  const viewCandidates = await commandCenterViewCandidates(page);

  for (const candidate of viewCandidates) {
    await candidate.click();
    const batchToggles = page.locator('[data-testid^="command-center-batch-toggle-"]');
    if ((await batchToggles.count()) > 0) {
      return batchToggles;
    }
  }

  return null;
}

async function openFirstCampaignAwareMetaCommandCenterAction(page: Page) {
  const viewCandidates = await commandCenterViewCandidates(page);

  for (const candidate of viewCandidates) {
    await candidate.click();
    const metaActions = page
      .locator('[data-testid^="command-center-action-"]')
      .filter({ hasText: "Meta Decision OS" });
    const count = await metaActions.count();
    for (let index = 0; index < count; index += 1) {
      const metaAction = metaActions.nth(index);
      await metaAction.click();
      const metaWorkflowDialog = page.getByRole("dialog");
      await expect(metaWorkflowDialog).toBeVisible();
      const href = await metaWorkflowDialog
        .getByRole("link", { name: "Open source surface" })
        .getAttribute("href");
      if (href?.includes("campaignId=")) {
        return metaWorkflowDialog;
      }
      await metaWorkflowDialog.getByRole("button", { name: "Close", exact: true }).click();
    }
  }

  throw new Error("No campaign-aware Meta-backed Command Center action was visible in fallback views.");
}

test("commercial truth smoke covers settings edit, Meta operating mode, and Creative context", async ({ page }, testInfo) => {
  test.slow();

  await page.goto("/settings");

  await expect(page.getByTestId("commercial-truth-settings")).toBeVisible();
  await page.getByTestId("commercial-target-roas").fill("3.1");
  await page.getByTestId("commercial-break-even-roas").fill("1.9");
  await page.getByTestId("commercial-country-code-0").fill("US");
  await page.getByTestId("commercial-economics-multiplier-0").fill("1.12");
  await page.getByTestId("commercial-stock-pressure").selectOption("watch");
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/business-commercial-settings") &&
      response.request().method() === "PUT",
    ),
    page.getByTestId("commercial-settings-save").click(),
  ]);
  expect(saveResponse.ok()).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("commercial-settings.png"),
    fullPage: true,
  });

  await page.goto("/platforms/meta");
  await page.getByText("Loading campaign performance").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});
  const operatingModeCard = page.getByTestId("meta-operating-mode-card");
  await expect(operatingModeCard).toBeVisible();
  await expect(operatingModeCard).toContainText("Operating Mode");
  await expect(operatingModeCard).toContainText(/Current Mode|Recommended Mode/);
  await expect(operatingModeCard).toContainText("Decisions use live windows");
  await expect(operatingModeCard).toContainText("Selected period affects analysis only");
  await expect(operatingModeCard).not.toContainText("Loading operating mode...");
  await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("meta-decision-os-overview")).toContainText("Decisions use live windows");
  await expect(page.getByTestId("meta-decision-os-overview")).toContainText("Selected period affects analysis only");
  await expect(page.getByTestId("meta-budget-shift-board")).toBeVisible();
  await expect(page.getByTestId("meta-winner-scale-candidates")).toBeVisible();
  await expect(page.getByTestId("meta-geo-board")).toBeVisible();
  await expect(page.getByTestId("meta-no-touch-list")).toBeVisible();
  let metaBaseline: Awaited<ReturnType<typeof captureMetaDecisionSignature>> | null = null;
  for (const range of BROWSER_DECISION_RANGES) {
    await setStoredDateRange(page, "metaDateRange", range.standard);
    await page.reload();
    await page.getByText("Loading campaign performance").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});
    await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible();
    await expect(page.getByTestId("meta-operating-mode-card")).not.toContainText("Loading operating mode...");
    const signature = await captureMetaDecisionSignature(page);
    if (!metaBaseline) {
      metaBaseline = signature;
    } else {
      expect(signature).toEqual(metaBaseline);
    }
  }
  await setStoredDateRange(page, "metaDateRange", STANDARD_DATE_RANGE);
  await page.reload();
  await page.getByText("Loading campaign performance").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});
  const campaignListItems = page.locator('[data-testid^="meta-list-item-"]');
  await expect(campaignListItems.first()).toBeVisible();
  await campaignListItems.first().click();
  await expect(page.getByTestId("meta-campaign-decision-panel")).toBeVisible();
  await expect(page.getByTestId("meta-campaign-adset-actions")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("commercial-meta-mode.png"),
    fullPage: true,
  });

  await page.goto("/command-center");
  await expect(page.getByTestId("command-center-page")).toBeVisible();
  await expect(page.getByTestId("command-center-page")).toContainText("Decisions use live windows");
  await expect(page.getByTestId("command-center-page")).toContainText("Selected period affects analysis only");
  await expect(page.getByTestId("command-center-historical-intelligence")).toBeVisible();
  let commandCenterBaseline: Awaited<ReturnType<typeof captureCommandCenterDecisionSignature>> | null = null;
  let commandCenterHistoricalBaseline: string | null = null;
  let commandCenterHistoricalChanged = false;
  for (const range of BROWSER_DECISION_RANGES) {
    await setStoredDateRange(page, "commandCenterDateRange", range.standard);
    await page.reload();
    await expect(page.getByTestId("command-center-page")).toBeVisible();
    await expect(page.getByTestId("command-center-budget-summary")).toBeVisible({
      timeout: 45_000,
    });
    const signature = await captureCommandCenterDecisionSignature(page);
    const historicalSignature = await captureCommandCenterHistoricalSignature(page);
    if (!commandCenterBaseline) {
      commandCenterBaseline = signature;
      commandCenterHistoricalBaseline = historicalSignature;
    } else {
      expect(signature).toEqual(commandCenterBaseline);
      if (historicalSignature !== commandCenterHistoricalBaseline) {
        commandCenterHistoricalChanged = true;
      }
    }
  }
  expect(commandCenterHistoricalChanged).toBeTruthy();
  await setStoredDateRange(page, "commandCenterDateRange", STANDARD_DATE_RANGE);
  await page.reload();
  await expect(page.getByTestId("command-center-page")).toBeVisible();
  await expect(page.getByTestId("command-center-budget-summary")).toBeVisible();
  await expect(page.getByTestId("command-center-shift-digest")).toBeVisible();
  await expect(page.getByTestId("command-center-feedback-summary")).toBeVisible();
  await expect(page.getByTestId("command-center-historical-intelligence")).toBeVisible();
  await expect(page.getByTestId("command-center-owner-workload")).toBeVisible();
  const queueActions = await selectFirstCommandCenterViewWithActions(page);
  await expect(queueActions.first()).toBeVisible();
  const batchToolbar = page.getByTestId("command-center-batch-toolbar");
  const batchToggles = await selectFirstCommandCenterViewWithBatchReadyActions(page);
  if (batchToggles) {
    const batchSelectionCount = Math.min(await batchToggles.count(), 2);
    for (let index = 0; index < batchSelectionCount; index += 1) {
      await batchToggles.nth(index).click();
    }
    await expect(batchToolbar).toContainText(`${batchSelectionCount} selected`);
    await batchToolbar.getByRole("button", { name: "Batch approve" }).click();
    await expect(batchToolbar).toContainText("0 selected");
    for (let index = 0; index < batchSelectionCount; index += 1) {
      await batchToggles.nth(index).click();
    }
    await batchToolbar.getByRole("button", { name: "Batch reopen" }).click();
    await expect(batchToolbar).toContainText("0 selected");
  } else {
    await expect(batchToolbar).toContainText("0 visible action(s) are batch-ready in this queue.");
    await expect(
      batchToolbar.getByRole("button", { name: "Batch approve" }),
    ).toBeDisabled();
  }

  const queueGapInput = page.getByPlaceholder("What action is missing from this queue?");
  await queueGapInput.fill("Missing donor-campaign queue item for manual reallocation.");
  await page.getByRole("button", { name: "Report missing action" }).click();
  await expect(queueGapInput).toHaveValue("");

  await queueActions.first().click();
  const workflowDialog = page.getByRole("dialog");
  await expect(workflowDialog.getByTestId("command-center-execution-panel")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-support-mode")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-support-matrix")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-selected-support")).toBeVisible();
  await expect(
    workflowDialog.getByTestId("command-center-execution-selected-rollback-kind"),
  ).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-audit")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-apply")).toBeDisabled();
  const feedbackPanel = workflowDialog.getByTestId("command-center-action-feedback");
  await expect(feedbackPanel).toBeVisible();
  await expect(workflowDialog.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await workflowDialog.getByRole("button", { name: "Approve", exact: true }).click();
  await workflowDialog.getByRole("button", { name: "Reopen", exact: true }).click();
  await workflowDialog.getByRole("button", { name: "Complete manual", exact: true }).click();
  await workflowDialog.getByRole("button", { name: "Reopen", exact: true }).click();
  await workflowDialog.getByRole("button", { name: "Reject", exact: true }).click();
  await workflowDialog.getByRole("button", { name: "Reopen", exact: true }).click();
  await workflowDialog.locator('label:has-text("Assign to") select').selectOption({ index: 1 });
  await workflowDialog.locator('label:has-text("Snooze until") input[type="datetime-local"]').fill("2026-04-12T09:00");
  await workflowDialog.getByPlaceholder("Add operator context, blockers, or approval rationale").fill("Smoke note from operator.");
  await workflowDialog.getByRole("button", { name: "Add note", exact: true }).click();
  await feedbackPanel
    .getByPlaceholder("Why was this a false positive or bad recommendation?")
    .fill("Smoke operator feedback on queue prioritization.");
  await feedbackPanel.getByRole("button", { name: "Mark false positive" }).click();
  await expect(feedbackPanel).toContainText("Smoke operator feedback on queue prioritization.");
  await workflowDialog.getByRole("button", { name: "Close", exact: true }).click();

  const metaWorkflowDialog = await openFirstCampaignAwareMetaCommandCenterAction(page);
  await metaWorkflowDialog.getByRole("link", { name: "Open source surface" }).click();
  await page.waitForURL(/\/platforms\/meta\?.*campaignId=/, { timeout: 45_000 });
  await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible();
  const metaDetailVisible = await page
    .getByTestId("meta-campaign-detail")
    .isVisible()
    .catch(() => false);
  if (!metaDetailVisible) {
    await expect(page.locator('[data-testid^="meta-list-item-"]').first()).toBeVisible();
  }
  await page.goBack();
  await expect(page.getByTestId("command-center-page")).toBeVisible();

  await page.getByPlaceholder("Save current view").fill("Smoke saved view");
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByTestId("command-center-handoffs").getByRole("button", { name: "Prefill from digest" }).click();
  await expect(
    page.getByTestId("command-center-handoffs").getByPlaceholder("Summary for the next shift"),
  ).not.toHaveValue("");
  await page.getByTestId("command-center-handoffs").getByRole("button", { name: "Save handoff" }).click();
  const handoffCard = page.locator('[data-testid^="command-center-handoff-"]').first();
  await expect(handoffCard).toBeVisible();
  await handoffCard.getByRole("button", { name: "Acknowledge" }).click();
  await page.screenshot({
    path: testInfo.outputPath("commercial-command-center.png"),
    fullPage: true,
  });

  await page.goto("/creatives");
  await page.getByRole("button", { name: "Creative Decision OS" }).click();
  await expect(page.getByTestId("creative-decision-os-drawer")).toBeVisible();
  await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("creative-decision-os-drawer")).toContainText("Decisions use live windows");
  await expect(page.getByTestId("creative-decision-os-drawer")).toContainText("Selected period affects analysis only");
  await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
  await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
  await expect(page.getByTestId("creative-historical-analysis")).toBeVisible();
  await page.getByLabel("Close Creative Decision OS").click();
  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();
  let creativeBaseline: Awaited<ReturnType<typeof captureCreativeDecisionSignature>> | null = null;
  let creativeHistoricalBaseline: string | null = null;
  let creativeHistoricalChanged = false;
  for (const range of BROWSER_DECISION_RANGES) {
    await setStoredDateRange(page, "creativeDateRange", range.creative);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Creative Decision OS" }).click();
    await expect(page.getByTestId("creative-decision-os-drawer")).toBeVisible();
    await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
    await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
    await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
    await expect(page.getByTestId("creative-historical-analysis")).toBeVisible();
    const signature = await captureCreativeDecisionSignature(page);
    const historicalSignature = await captureCreativeHistoricalSignature(page);
    if (!creativeBaseline) {
      creativeBaseline = signature;
      creativeHistoricalBaseline = historicalSignature;
    } else {
      expect(signature).toEqual(creativeBaseline);
      if (historicalSignature !== creativeHistoricalBaseline) {
        creativeHistoricalChanged = true;
      }
    }
    await page.getByLabel("Close Creative Decision OS").click();
  }
  expect(creativeHistoricalChanged).toBeTruthy();

  await page.getByRole("button", { name: "Creative Decision OS" }).click();
  const familyCards = page.locator('button[data-testid^="creative-family-"]');
  await expect(familyCards.first()).toBeVisible();
  const preFilterCount = await page.locator('[data-testid^="creative-row-"]').count();
  await familyCards.first().click();
  const postFilterCount = await page.locator('[data-testid^="creative-row-"]').count();
  expect(postFilterCount).toBeGreaterThan(0);
  expect(postFilterCount).toBeLessThanOrEqual(preFilterCount);
  await page.getByLabel("Close Creative Decision OS").click();
  await page.getByRole("button", { name: "Clear" }).click();

  const creativeRows = page.locator('[data-testid^="creative-row-"]');
  await expect(creativeRows.first()).toBeVisible();
  await creativeRows.first().click();

  await expect(page.getByTestId("creative-detail-deterministic-decision")).toBeVisible();
  await expect(page.getByTestId("creative-detail-command-center")).toBeVisible();
  await expect(page.getByTestId("creative-detail-deployment-matrix")).toBeVisible();
  await expect(page.getByTestId("creative-detail-benchmark-evidence")).toBeVisible();
  await expect(page.getByTestId("creative-detail-fatigue-evidence")).toBeVisible();
  await expect(page.getByTestId("creative-detail-commercial-context")).toBeVisible();
  await expect(page.getByTestId("creative-detail-ai-commentary")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("commercial-creative-context.png"),
    fullPage: true,
  });
});

test("commercial execution canary smoke applies and rolls back a supported ad set when configured", async ({
  page,
}) => {
  const executionBusinessId =
    process.env.PLAYWRIGHT_EXECUTION_CANARY_BUSINESS_ID ??
    process.env.COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID;
  test.skip(
    !executionBusinessId,
    "Execution canary smoke requires COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID.",
  );
  test.slow();

  await page.goto("/command-center");
  const switchResponse = await page.evaluate(async (businessId) => {
    const response = await fetch("/api/auth/switch-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ businessId }),
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  }, executionBusinessId);
  expect(switchResponse.ok, switchResponse.text).toBeTruthy();

  await page.goto("/command-center");
  const queueActions = page.locator('[data-testid^="command-center-action-"]');
  await expect(queueActions.first()).toBeVisible({ timeout: 45_000 });

  let supportedActionFound = false;
  const totalActions = await queueActions.count();
  const maxActionsToScan = Math.min(totalActions, 40);

  for (let index = 0; index < maxActionsToScan; index += 1) {
    await queueActions.nth(index).click();
    const workflowDialog = page.getByRole("dialog");
    await expect(workflowDialog.getByTestId("command-center-execution-panel")).toBeVisible();
    await expect(workflowDialog.getByTestId("command-center-execution-support-matrix")).toBeVisible();
    const supportText = (
      await workflowDialog
        .getByTestId("command-center-execution-support-mode")
        .textContent()
    )?.trim()
      .toLowerCase();
    if (supportText !== "supported") continue;

    supportedActionFound = true;
    await workflowDialog.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(workflowDialog.getByTestId("command-center-execution-apply")).toBeEnabled({
      timeout: 45_000,
    });
    await workflowDialog.getByTestId("command-center-execution-apply").click();
    await expect(workflowDialog).toContainText(/executed/i, { timeout: 45_000 });
    await expect(workflowDialog.getByTestId("command-center-execution-rollback")).toBeEnabled({
      timeout: 45_000,
    });
    await workflowDialog.getByTestId("command-center-execution-rollback").click();
    await expect(workflowDialog).toContainText(/rolled back/i, { timeout: 45_000 });
    await expect(workflowDialog.getByTestId("command-center-execution-audit")).toContainText(
      /apply|rollback/i,
    );
    break;
  }

  expect(supportedActionFound).toBeTruthy();
});
