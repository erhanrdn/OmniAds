import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { seedReviewerAccount } from "../helpers/reviewer-auth";

const authFile = path.join(process.cwd(), "playwright/.auth/reviewer.json");

setup("seed reviewer and sign in through /login", async ({ page, baseURL }) => {
  let lastLoginFailure: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const seeded = await seedReviewerAccount();

    await page.goto(`${baseURL}/login`);
    await page.locator("#email").fill(seeded.reviewer.email);
    await page.locator("#password").fill(seeded.reviewer.password);

    const [loginResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/auth/login")),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);

    if (!loginResponse.ok()) {
      lastLoginFailure = `${loginResponse.status()} ${await loginResponse.text()}`;
      continue;
    }

    try {
      await expect
        .poll(async () => {
          return page.evaluate(async () => {
            const response = await fetch("/api/auth/me", {
              credentials: "include",
              cache: "no-store",
            });
            return response.status;
          });
        })
        .toBe(200);

      await page.context().storageState({ path: authFile });
      return;
    } catch (error) {
      lastLoginFailure = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Reviewer login failed after 3 attempts. Last failure: ${lastLoginFailure ?? "unknown"}`);
});
