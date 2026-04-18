import { describe, expect, it } from "vitest";
import {
  measureGoogleAdsCloseoutSurface,
  parseGoogleAdsCloseoutSmokeArgs,
  shouldGoogleAdsCloseoutSmokeFail,
} from "@/scripts/google-ads-closeout-smoke";

describe("google ads closeout smoke", () => {
  it("parses the required closeout smoke arguments", () => {
    const args = parseGoogleAdsCloseoutSmokeArgs([
      "--business-id",
      "biz-1",
      "--start-date",
      "2026-04-05",
      "--end-date",
      "2026-04-17",
      "--base-url",
      "https://adsecute.com/",
    ]);

    expect(args).toEqual(
      expect.objectContaining({
        businessId: "biz-1",
        startDate: "2026-04-05",
        endDate: "2026-04-17",
        baseUrl: "https://adsecute.com",
      }),
    );
  });

  it("fails only on non-skipped failing surfaces", () => {
    expect(
      shouldGoogleAdsCloseoutSmokeFail([
        {
          surface: "overview",
          ok: true,
          skipped: false,
          durationMs: 12,
          detail: "ok",
        },
        {
          surface: "status",
          ok: false,
          skipped: true,
          durationMs: 0,
          detail: "skipped",
        },
      ]),
    ).toBe(false);

    expect(
      shouldGoogleAdsCloseoutSmokeFail([
        {
          surface: "products",
          ok: false,
          skipped: false,
          durationMs: 24,
          detail: "timeout",
        },
      ]),
    ).toBe(true);
  });

  it("times out an individual surface instead of hanging the whole smoke run", async () => {
    const result = await measureGoogleAdsCloseoutSurface(
      "products",
      5,
      async () => new Promise<string>(() => undefined),
    );

    expect(result).toMatchObject({
      surface: "products",
      ok: false,
      skipped: false,
      detail: "Timed out after 5ms",
    });
  });
});
