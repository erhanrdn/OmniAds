import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { seedCommercialSmokeOperator } from "../helpers/commercial-operator-auth";

const authFile = path.join(process.cwd(), "playwright/.auth/commercial-operator.json");

setup("seed commercial smoke operator and sign in through /login", async ({ page, baseURL }) => {
  let lastLoginFailure: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const seeded = await seedCommercialSmokeOperator();

    await page.goto(`${baseURL}/login`);
    await page.locator("#email").fill(seeded.operator.email);
    await page.locator("#password").fill(seeded.operator.password);

    const loginResponse = await page.evaluate(
      async ({ email, password }) => {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        return {
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        };
      },
      {
        email: seeded.operator.email,
        password: seeded.operator.password,
      },
    );

    if (!loginResponse.ok) {
      lastLoginFailure = `${loginResponse.status} ${loginResponse.text}`;
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

  throw new Error(
    `Commercial smoke operator login failed after 3 attempts. Last failure: ${lastLoginFailure ?? "unknown"}`,
  );
});
