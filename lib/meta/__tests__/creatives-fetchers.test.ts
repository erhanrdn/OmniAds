import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCreativeDetailsMap,
  getCreativeDetailAdvancedFields,
  getCreativeDetailFields,
  getCreativeMediaFields,
  getCreativeSummaryFields,
  getNestedCreativeMediaFields,
  getNestedCreativeSummaryFields,
} from "@/lib/meta/creatives-fetchers";

describe("creative detail field contracts", () => {
  it("keeps unsupported catalog fields out of the safe detail request", () => {
    expect(getCreativeDetailFields()).not.toContain("catalog_id");
    expect(getCreativeDetailFields()).not.toContain("product_set_id");
    expect(getCreativeDetailAdvancedFields()).toContain("catalog_id");
    expect(getCreativeDetailAdvancedFields()).toContain("product_set_id");
  });

  it("keeps thumbnail_url out of ids and nested ad creative field sets", () => {
    expect(getCreativeDetailFields().startsWith("id,name,object_type,video_id,object_story_spec")).toBe(true);
    expect(getCreativeMediaFields().startsWith("id,name,object_type,video_id,object_story_spec")).toBe(true);
    expect(getCreativeSummaryFields()).not.toContain("thumbnail_url");
    expect(getNestedCreativeMediaFields().startsWith("id,name,object_type,video_id,object_story_spec")).toBe(true);
    expect(getNestedCreativeSummaryFields()).not.toContain("thumbnail_url");
    expect(getCreativeDetailFields()).not.toContain("image_hash,");
    expect(getCreativeMediaFields()).not.toContain("image_hash,");
    expect(getNestedCreativeMediaFields()).not.toContain("image_hash,");
  });
});

describe("fetchCreativeDetailsMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps safe detail results when optional advanced fields fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            "cr_1": {
              id: "cr_1",
              object_type: "VIDEO",
              thumbnail_url: "https://example.com/thumb.jpg",
              object_story_spec: {
                template_data: { link: "https://example.com" },
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "unsupported field" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCreativeDetailsMap(["cr_1"], "token-fetchers-test");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.get("cr_1")).toMatchObject({
      id: "cr_1",
      object_type: "VIDEO",
      thumbnail_url: "https://example.com/thumb.jpg",
    });
  });
});
