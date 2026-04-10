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

  await page.goto("/creatives");
  await expect(page.getByTestId("creative-decision-signals")).toBeVisible();

  const creativeRows = page.locator('[data-testid^="creative-row-"]');
  await expect(creativeRows.first()).toBeVisible();
  await creativeRows.first().click();

  await expect(page.getByTestId("creative-detail-deterministic-decision")).toBeVisible();
  await expect(page.getByTestId("creative-detail-commercial-context")).toBeVisible();
  await expect(page.getByTestId("creative-detail-ai-commentary")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("commercial-creative-context.png"),
    fullPage: true,
  });
});
