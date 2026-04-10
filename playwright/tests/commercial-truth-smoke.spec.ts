import { expect, test } from "@playwright/test";

test("commercial truth smoke covers settings edit, Meta operating mode, and Creative context", async ({ page }, testInfo) => {
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
  await expect(page.getByTestId("meta-decision-os-overview")).toBeVisible();
  await expect(page.getByTestId("meta-budget-shift-board")).toBeVisible();
  await expect(page.getByTestId("meta-geo-board")).toBeVisible();
  await expect(page.getByTestId("meta-no-touch-list")).toBeVisible();
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
  const queueActions = page.locator('[data-testid^="command-center-action-"]');
  await expect(queueActions.first()).toBeVisible();
  await queueActions.first().click();
  const workflowDialog = page.getByRole("dialog");
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
  await expect(page.getByTestId("creative-lifecycle-board")).toBeVisible();
  await expect(page.getByTestId("creative-operator-queues")).toBeVisible();
  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();

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
