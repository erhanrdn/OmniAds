import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const useWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== "0";

export default defineConfig({
  testDir: "./playwright/tests",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /(^|\/)auth\.setup\.ts$/,
    },
    {
      name: "commercial-setup",
      testMatch: /(^|\/)commercial-auth\.setup\.ts$/,
    },
    {
      name: "smoke-chromium",
      testMatch: /reviewer-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/reviewer.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "commercial-smoke-chromium",
      testMatch: /commercial-truth-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/commercial-operator.json",
      },
      dependencies: ["commercial-setup"],
    },
  ],
  webServer: useWebServer
    ? {
        command:
          "ALLOW_INSECURE_LOCAL_AUTH_COOKIE=1 HOSTNAME=127.0.0.1 PORT=3000 node --env-file=.env.local .next/standalone/server.js",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
