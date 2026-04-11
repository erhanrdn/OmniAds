import { expect, test } from "@playwright/test";

async function selectFirstReviewerCommandCenterViewWithActions(page: import("@playwright/test").Page) {
  const viewCandidates = [
    page.getByRole("button", { name: "Default queue" }),
    page.getByTestId("command-center-view-no_touch_surfaces"),
    page.getByTestId("command-center-view-archive_context"),
    page.getByTestId("command-center-view-today_priorities"),
  ];

  for (const candidate of viewCandidates) {
    await candidate.click();
    const queueActions = page.locator('[data-testid^="command-center-action-"]');
    if ((await queueActions.count()) > 0) {
      return queueActions;
    }
  }

  throw new Error("No Command Center actions were visible for the reviewer smoke flow.");
}

test("reviewer smoke covers Meta recommendations and creative decision surfaces", async ({ page }, testInfo) => {
  await page.goto("/platforms/meta");
  await page.getByText("Loading campaign performance").waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});

  await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("meta-budget-shift-board")).toBeVisible();
  await expect(page.getByTestId("meta-winner-scale-candidates")).toBeVisible();
  await expect(page.getByTestId("meta-geo-board")).toBeVisible();
  await expect(page.getByTestId("meta-no-touch-list")).toBeVisible();
  await expect(page.getByTestId("meta-recommendations-panel")).toBeVisible();
  await expect(page.getByTestId("meta-recommendations-panel")).toContainText("Recommendations");
  await expect(page.getByTestId("meta-recommendations-run")).toContainText(/Run Recommendations|Refresh Recommendations/);

  const campaignListItems = page.locator('[data-testid^="meta-list-item-"]');
  await expect(campaignListItems.first()).toBeVisible();
  await campaignListItems.first().click();

  await expect(page.getByTestId("meta-campaign-detail")).toBeVisible();
  await expect(page.getByTestId("meta-campaign-decision-panel")).toBeVisible();
  await expect(page.getByTestId("meta-campaign-adset-actions")).toBeVisible();
  await expect(page.getByTestId("meta-adsets-section")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("meta-smoke.png"), fullPage: true });

  await page.goto("/command-center");
  await expect(page.getByTestId("command-center-page")).toBeVisible();
  await expect(page.getByTestId("command-center-read-only-banner")).toBeVisible();
  await expect(page.getByTestId("command-center-budget-summary")).toBeVisible();
  await expect(page.getByTestId("command-center-owner-workload")).toBeVisible();
  await expect(page.getByTestId("command-center-feedback-summary")).toBeVisible();
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
  const reviewerFeedbackPanel = page.getByTestId("command-center-action-feedback");
  await expect(reviewerFeedbackPanel).toBeVisible();
  await expect(
    reviewerFeedbackPanel.getByRole("button", { name: "Mark false positive" }),
  ).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("command-center-reviewer.png"), fullPage: true });

  await page.goto("/creatives");

  await page.getByRole("button", { name: "Creative Decision OS" }).click();
  await expect(page.getByTestId("creative-decision-os-drawer")).toBeVisible();
  await expect(page.getByTestId("creative-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
  await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
  await expect(page.getByTestId("creative-family-board")).toBeVisible();
  await expect(page.getByTestId("creative-pattern-board")).toBeVisible();
  await expect(page.getByTestId("creative-protected-winners")).toBeVisible();
  await expect(page.getByTestId("creative-supply-plan")).toBeVisible();
  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();
  await expect(page.getByTestId("creative-run-signals")).toContainText(/Run Signals|Refresh Signals/);

  const totalBeforeFilter = await page.locator('[data-testid^="creative-row-"]').count();
  await page.getByTestId("creative-queue-promotion").click();
  const totalAfterQueueFilter = await page.locator('[data-testid^="creative-row-"]').count();
  expect(totalAfterQueueFilter).toBeGreaterThan(0);
  expect(totalAfterQueueFilter).toBeLessThanOrEqual(totalBeforeFilter);
  await page.getByLabel("Close Creative Decision OS").click();
  await expect(page.getByText("Decision OS filter: Promotion queue")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();

  const creativeRows = page.locator('[data-testid^="creative-row-"]');
  await expect(creativeRows.first()).toBeVisible();
  await creativeRows.first().click();
  await expect(page).toHaveURL(/creative=/);

  await expect(page.getByTestId("creative-detail-deterministic-decision")).toBeVisible();
  await expect(page.getByTestId("creative-detail-command-center")).toBeVisible();
  await expect(page.getByTestId("creative-detail-deployment-matrix")).toBeVisible();
  await expect(page.getByTestId("creative-detail-benchmark-evidence")).toBeVisible();
  await expect(page.getByTestId("creative-detail-fatigue-evidence")).toBeVisible();
  const commentarySection = page.getByTestId("creative-detail-ai-commentary");
  await expect(commentarySection).toBeVisible();
  await commentarySection.getByRole("button", { name: /Generate AI interpretation|Refresh interpretation/ }).click();
  await expect(commentarySection).toContainText(/Opportunities|Next actions|Risks|AI interpretation is temporarily unavailable/, {
    timeout: 45_000,
  });
  await page.screenshot({ path: testInfo.outputPath("creatives-smoke.png"), fullPage: true });
});
