import { expect, test } from "@playwright/test";

test("reviewer smoke covers Meta recommendations and creative decision surfaces", async ({ page }, testInfo) => {
  await page.goto("/platforms/meta");

  await expect(page.getByTestId("meta-recommendations-panel")).toBeVisible();
  await expect(page.getByTestId("meta-recommendations-panel")).toContainText("Recommendations");
  await expect(page.getByTestId("meta-recommendations-run")).toContainText(/Run Recommendations|Refresh Recommendations/);

  const campaignListItems = page.locator('[data-testid^="meta-list-item-"]');
  await expect(campaignListItems.first()).toBeVisible();
  await campaignListItems.first().click();

  await expect(page.getByTestId("meta-campaign-detail")).toBeVisible();
  await expect(page.getByTestId("meta-adsets-section")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("meta-smoke.png"), fullPage: true });

  await page.goto("/creatives");

  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();
  await expect(page.getByTestId("creative-run-signals")).toContainText(/Run Signals|Refresh Signals/);

  const creativeRows = page.locator('[data-testid^="creative-row-"]');
  await expect(creativeRows.first()).toBeVisible();
  await creativeRows.first().click();

  await expect(page.getByTestId("creative-detail-deterministic-decision")).toBeVisible();
  const commentarySection = page.getByTestId("creative-detail-ai-commentary");
  await expect(commentarySection).toBeVisible();
  await commentarySection.getByRole("button", { name: /Generate AI interpretation|Refresh interpretation/ }).click();
  await expect(commentarySection).toContainText(/Opportunities|Next actions|Risks|AI interpretation is temporarily unavailable/, {
    timeout: 45_000,
  });
  await page.screenshot({ path: testInfo.outputPath("creatives-smoke.png"), fullPage: true });
});
