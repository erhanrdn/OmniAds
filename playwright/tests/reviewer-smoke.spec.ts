import { expect, test } from "@playwright/test";

async function commandCenterViewCandidates(page: import("@playwright/test").Page) {
  const candidates = [page.getByRole("button", { name: "Default queue", exact: true })];
  const savedViews = page.locator('[data-testid^="command-center-view-"]');
  const savedViewCount = await savedViews.count();
  for (let index = 0; index < savedViewCount; index += 1) {
    candidates.push(savedViews.nth(index));
  }
  return candidates;
}

async function selectFirstReviewerCommandCenterViewWithActions(page: import("@playwright/test").Page) {
  const viewCandidates = await commandCenterViewCandidates(page);

  for (const candidate of viewCandidates) {
    await candidate.click();
    const queueActions = page.locator('[data-testid^="command-center-action-"]');
    if ((await queueActions.count()) > 0) {
      return queueActions;
    }
  }

  throw new Error("No Command Center actions were visible for the reviewer smoke flow.");
}

async function expectVisibleIfPresent(locator: import("@playwright/test").Locator) {
  if ((await locator.count()) > 0) {
    await expect(locator).toBeVisible();
  }
}

async function openDetailsIfNeeded(details: import("@playwright/test").Locator) {
  await expect(details).toBeVisible();
  const isOpen = await details.evaluate((element) => element.hasAttribute("open"));
  if (!isOpen) {
    await details.locator("summary").click();
  }
}

async function runMetaAnalysis(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("meta-analysis-status-card")).toBeVisible();
  await expect(page.getByTestId("meta-decision-os-empty")).toBeVisible();

  const decisionOsResponse = page.waitForResponse((response) =>
    response.url().includes("/api/meta/decision-os") &&
    response.request().method() === "GET",
  );
  const recommendationsResponse = page.waitForResponse((response) =>
    response.url().includes("/api/meta/recommendations") &&
    response.request().method() === "GET",
  );

  await page.getByRole("button", { name: /^Run analysis$/i }).first().click();
  const [decisionOs, recommendations] = await Promise.all([
    decisionOsResponse,
    recommendationsResponse,
  ]);
  expect(decisionOs.ok()).toBeTruthy();
  expect(recommendations.ok()).toBeTruthy();

  await expect(page.getByTestId("meta-analysis-status-card")).toContainText(
    "Last successful analysis",
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible({
    timeout: 60_000,
  });
}

test("reviewer smoke covers Meta recommendations and creative decision surfaces", async ({ page }, testInfo) => {
  await page.goto("/platforms/meta");
  await page.getByText("Loading campaign performance").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});

  await runMetaAnalysis(page);
  await expect(page.getByTestId("meta-authority-readiness")).toBeVisible();
  await expect(page.getByTestId("meta-operator-plan-summary")).toBeVisible();
  await expect(page.getByTestId("meta-top-action-core")).toBeVisible();
  await expect(page.getByTestId("meta-watchlist-degraded")).toBeVisible();
  await expectVisibleIfPresent(page.getByTestId("meta-no-touch-list"));
  await expect(page.getByTestId("meta-supporting-context")).toBeVisible();
  await openDetailsIfNeeded(page.getByTestId("meta-supporting-context"));
  await expect(page.getByTestId("meta-recommendations-panel")).toBeVisible();
  await expect(page.getByTestId("meta-recommendations-panel")).toContainText("Supporting Context");
  await expect(page.getByTestId("meta-recommendations-run")).toContainText(
    /Run Analysis|Check all items before re-running/,
  );

  await expect(page.locator('[data-testid^="meta-list-item-"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("meta-smoke.png"), fullPage: true });

  await page.goto("/command-center");
  await expect(page.getByTestId("command-center-page")).toBeVisible();
  await expect(page.getByTestId("command-center-read-only-banner")).toBeVisible();
  await expect(page.getByTestId("command-center-budget-summary")).toBeVisible();
  await expect(page.getByTestId("command-center-owner-workload")).toBeVisible();
  await expect(page.getByTestId("command-center-feedback-summary")).toBeVisible();
  await expect(page.getByTestId("command-center-historical-intelligence")).toBeVisible();
  const reviewerBatchToolbar = page.getByTestId("command-center-batch-toolbar");
  await expect(reviewerBatchToolbar).toBeVisible();
  await expect(
    reviewerBatchToolbar.getByRole("button", { name: "Batch approve" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Report missing action" }),
  ).toBeDisabled();
  await expect(page.getByTestId("command-center-journal")).toBeVisible();
  await expect(page.getByTestId("command-center-handoffs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save view" })).toBeDisabled();
  const reviewerQueueActions = await selectFirstReviewerCommandCenterViewWithActions(page);
  await expect(reviewerQueueActions.first()).toBeVisible();
  await reviewerQueueActions.first().click();
  const reviewerExecutionPanel = page.getByTestId("command-center-execution-panel");
  await expect(reviewerExecutionPanel).toBeVisible();
  await expect(reviewerExecutionPanel).toContainText(/Preview first, apply second|Execution preview failed/);
  await expect(
    reviewerExecutionPanel.getByTestId("command-center-execution-support-matrix"),
  ).toBeVisible();
  await expect(
    reviewerExecutionPanel.getByTestId("command-center-execution-selected-support"),
  ).toBeVisible();
  const reviewerFeedbackPanel = page.getByTestId("command-center-action-feedback");
  await expect(reviewerFeedbackPanel).toBeVisible();
  await expect(
    reviewerFeedbackPanel.getByRole("button", { name: "Mark false positive" }),
  ).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("command-center-reviewer.png"), fullPage: true });

  await page.goto("/creatives");
  await expect(page.getByTestId("creative-preview-truth-contract")).toHaveCount(0);
  await expect(page.getByTestId("creative-quick-filters-panel")).toHaveCount(0);
  await expect(page.getByTestId("creative-quick-filters")).toHaveCount(0);

  await page.getByRole("button", { name: "Decision support" }).click();
  await expect(page.getByTestId("creative-decision-os-drawer")).toBeVisible();
  await expect(page.getByTestId("creative-decision-os-drawer")).toContainText("Creative Decision Support");
  await expect(page.getByTestId("creative-decision-os-drawer")).toContainText(
    "The page worklist stays primary. This drawer is support for live-window decision context only.",
  );
  await expect(page.getByTestId("creative-preview-truth-contract")).toBeVisible();
  await expect(page.getByTestId("creative-preview-truth-contract")).toContainText("Preview Truth Contract");
  await expect(page.getByTestId("creative-preview-truth-contract")).toContainText(
    "Ready preview media supports decisive action language. Degraded preview keeps review metrics-only. Missing preview blocks authoritative action.",
  );
  await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("creative-preview-truth-summary")).toBeVisible();
  await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
  await expect(page.getByTestId("creative-quick-filters-panel")).toBeVisible();
  await expect(page.getByTestId("creative-family-board")).toBeVisible();
  await expect(page.getByTestId("creative-pattern-board")).toBeVisible();
  await expect(page.getByTestId("creative-protected-winners")).toBeVisible();
  await expect(page.getByTestId("creative-supply-plan")).toBeVisible();
  await expect(page.getByTestId("creative-historical-analysis")).toBeVisible();
  await expect(page.getByTestId("creative-quick-filters")).toBeVisible();

  const totalBeforeFilter = await page.locator('[data-testid^="creative-row-"]').count();
  const firstQuickFilter = page.locator('[data-testid^="creative-quick-filter-"]').first();
  await firstQuickFilter.scrollIntoViewIfNeeded();
  await firstQuickFilter.focus();
  await firstQuickFilter.press("Enter");
  const totalAfterQuickFilter = await page.locator('[data-testid^="creative-row-"]').count();
  expect(totalAfterQuickFilter).toBeGreaterThan(0);
  expect(totalAfterQuickFilter).toBeLessThanOrEqual(totalBeforeFilter);
  await page.getByLabel("Close Creative Decision OS").click();
  await expect(page.getByText(/Quick filter:/)).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();

  const creativeRows = page.locator('[data-testid^="creative-row-"]');
  await expect(creativeRows.first()).toBeVisible();
  await creativeRows.first().click();
  await expect(page).toHaveURL(/creative=/);

  await expect(page.getByTestId("creative-detail-deterministic-decision")).toBeVisible();
  await expect(page.getByTestId("creative-detail-deterministic-decision")).toContainText("Primary decision");
  await expect(page.getByTestId("creative-detail-deterministic-decision")).toContainText("Queue status");
  await expect(page.getByTestId("creative-detail-preview-truth")).toBeVisible();
  await expect(page.getByTestId("creative-detail-preview-truth")).toContainText("Preview Truth Gate");
  await expect(page.getByTestId("creative-detail-command-center")).toBeVisible();
  await expect(page.getByTestId("creative-detail-deployment-matrix")).toBeVisible();
  await expect(page.getByTestId("creative-detail-benchmark-evidence")).toBeVisible();
  await expect(page.getByTestId("creative-detail-fatigue-evidence")).toBeVisible();
  const commentarySection = page.getByTestId("creative-detail-ai-commentary");
  await expect(commentarySection).toBeVisible();
  await expect(commentarySection).toContainText("Support only");
  const commentaryButton = commentarySection.getByRole("button", {
    name: /Generate AI interpretation|Refresh interpretation/,
  });
  if (await commentaryButton.count()) {
    await expect(commentarySection).toContainText(
      "Support only. AI commentary does not change the deterministic decision.",
    );
    await commentaryButton.click();
    await expect(commentarySection).toContainText(/Opportunities|Next actions|Risks|AI interpretation is temporarily unavailable/, {
      timeout: 45_000,
    });
  } else {
    await expect(commentarySection).toContainText(/AI interpretation stays disabled|AI interpretation is temporarily unavailable/);
  }
  await page.screenshot({ path: testInfo.outputPath("creatives-smoke.png"), fullPage: true });
});
