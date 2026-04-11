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
  const cards = page.locator('[data-testid^="command-center-action-"]');
  const count = Math.min(await cards.count(), 3);
  const entries: string[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(normalizeText(await cards.nth(index).textContent()));
  }
  return entries;
}

async function captureCreativeDecisionSignature(
  page: Page,
) {
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
  let commandCenterBaseline: Awaited<ReturnType<typeof captureCommandCenterDecisionSignature>> | null = null;
  for (const range of BROWSER_DECISION_RANGES) {
    await setStoredDateRange(page, "commandCenterDateRange", range.standard);
    await page.reload();
    await expect(page.getByTestId("command-center-page")).toBeVisible();
    const queueActionsForRange = page.locator('[data-testid^="command-center-action-"]');
    await expect(queueActionsForRange.first()).toBeVisible({ timeout: 45_000 });
    const signature = await captureCommandCenterDecisionSignature(page);
    if (!commandCenterBaseline) {
      commandCenterBaseline = signature;
    } else {
      expect(signature).toEqual(commandCenterBaseline);
    }
  }
  await setStoredDateRange(page, "commandCenterDateRange", STANDARD_DATE_RANGE);
  await page.reload();
  await expect(page.getByTestId("command-center-page")).toBeVisible();
  const queueActions = page.locator('[data-testid^="command-center-action-"]');
  await expect(queueActions.first()).toBeVisible();
  await queueActions.first().click();
  const workflowDialog = page.getByRole("dialog");
  await expect(workflowDialog.getByTestId("command-center-execution-panel")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-support-mode")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-audit")).toBeVisible();
  await expect(workflowDialog.getByTestId("command-center-execution-apply")).toBeDisabled();
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
  await workflowDialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByPlaceholder("Save current view").fill("Smoke saved view");
  await page.getByRole("button", { name: "Save view" }).click();
  await queueActions.first().click();
  await page.getByTestId("command-center-handoffs").getByPlaceholder("Summary for the next shift").fill("Watch promo budget reallocations.");
  await page.getByRole("button", { name: "Link selected action" }).click();
  await page.getByTestId("command-center-handoffs").getByRole("button", { name: "Save handoff" }).click();
  const handoffCard = page.locator('[data-testid^="command-center-handoff-"]').first();
  await expect(handoffCard).toBeVisible();
  await handoffCard.getByRole("button", { name: "Acknowledge" }).click();
  await page.screenshot({
    path: testInfo.outputPath("commercial-command-center.png"),
    fullPage: true,
  });

  await page.goto("/creatives");
  await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("creative-decision-os-overview")).toContainText("Decisions use live windows");
  await expect(page.getByTestId("creative-decision-os-overview")).toContainText("Selected period affects analysis only");
  await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
  await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();
  let creativeBaseline: Awaited<ReturnType<typeof captureCreativeDecisionSignature>> | null = null;
  for (const range of BROWSER_DECISION_RANGES) {
    await setStoredDateRange(page, "creativeDateRange", range.creative);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
    await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
    await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
    const signature = await captureCreativeDecisionSignature(page);
    if (!creativeBaseline) {
      creativeBaseline = signature;
    } else {
      expect(signature).toEqual(creativeBaseline);
    }
  }

  const familyCards = page.locator('button[data-testid^="creative-family-"]');
  await expect(familyCards.first()).toBeVisible();
  const preFilterCount = await page.locator('[data-testid^="creative-row-"]').count();
  await familyCards.first().click();
  const postFilterCount = await page.locator('[data-testid^="creative-row-"]').count();
  expect(postFilterCount).toBeGreaterThan(0);
  expect(postFilterCount).toBeLessThanOrEqual(preFilterCount);
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
    break;
  }

  expect(supportedActionFound).toBeTruthy();
});
