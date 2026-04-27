import { chromium, expect } from "@playwright/test";

const forbiddenActionTerms = [
  /\bApply\b/i,
  /\bQueue\b/i,
  /\bPush\b/i,
  /\bAuto\b/i,
  /Scale now/i,
  /Cut now/i,
  /\bApprove\b/i,
];

const forbiddenInternalTerms = [
  /\bgold\b/i,
  /\bfixture\b/i,
  /\bPR\b/,
  /ChatGPT/i,
  /Claude/i,
  /Codex/i,
  /\bWIP\b/,
  /internal evaluation/i,
  /labels this row/i,
];

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required locally to run the self-hosted smoke. ` +
        "Do not paste or commit domains, tokens, cookies, DB URLs, or credentials.",
    );
  }
  return value;
}

function pathOnly(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search ? "?<query>" : ""}`;
  } catch {
    return "<unparseable>";
  }
}

function hasForbidden(text: string, patterns: RegExp[]) {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function assertEmpty(label: string, values: unknown[]) {
  if (values.length === 0) return;
  throw new Error(`Creative v2 self-hosted smoke failed: ${label}.`);
}

async function main() {
  const baseUrl = requiredEnv("CREATIVE_V2_SMOKE_BASE_URL").replace(/\/$/, "");
  const storageState = process.env.CREATIVE_V2_SMOKE_STORAGE_STATE?.trim();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  const mutationRequests: Array<{ method: string; path: string; phase: string }> = [];
  let phase = "setup";

  page.on("request", (request) => {
    const method = request.method().toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
    mutationRequests.push({
      method,
      path: pathOnly(request.url()),
      phase,
    });
  });

  phase = "no_flag";
  await page.goto(`${baseUrl}/creatives`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("creative-v2-preview-surface")).toHaveCount(0);

  phase = "with_flag";
  await page.goto(`${baseUrl}/creatives?creativeDecisionOsV2Preview=1`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByTestId("creative-v2-preview-surface")).toBeVisible();
  await expect(page.getByTestId("creative-v2-today-priority")).toBeVisible();
  await expect(page.getByText("Scale-ready")).toBeVisible();
  await expect(page.getByTestId("creative-v2-ready-confirmation")).toBeVisible();
  await expect(page.getByTestId("creative-v2-diagnose-first")).toBeVisible();
  await expect(page.getByTestId("creative-v2-inactive-review")).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  const actionViolations = hasForbidden(bodyText, forbiddenActionTerms);
  const internalViolations = hasForbidden(bodyText, forbiddenInternalTerms);

  phase = "detail_open";
  const firstReadOnlyButton = page
    .getByTestId("creative-v2-preview-surface")
    .getByRole("button")
    .first();
  if ((await firstReadOnlyButton.count()) > 0) {
    await firstReadOnlyButton.click();
    await page.waitForTimeout(500);
  }

  await browser.close();

  const result = {
    selfHostedRuntimeSmoke: "completed",
    domainRecorded: false,
    noFlagV2PreviewVisible: false,
    withFlagV2PreviewVisible: true,
    todayPriorityVisible: true,
    scaleReadyCopyVisible: true,
    readyConfirmationVisible: true,
    diagnoseVisible: true,
    inactiveVisible: true,
    forbiddenActionViolations: actionViolations,
    forbiddenInternalViolations: internalViolations,
    mutationRequests,
  };

  console.log(JSON.stringify(result, null, 2));

  assertEmpty("forbidden action language visible", actionViolations);
  assertEmpty("forbidden internal language visible", internalViolations);
  assertEmpty("write-like network requests captured", mutationRequests);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
