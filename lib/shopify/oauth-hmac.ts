import crypto from "crypto";

function buildSignedQueryMessage(url: URL) {
  return url.search
    .replace(/^\?/, "")
    .split("&")
    .filter(Boolean)
    .filter((part) => {
      const [rawKey = ""] = part.split("=", 1);
      const key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
      return key !== "hmac" && key !== "signature";
    })
    .sort((a, b) => a.localeCompare(b))
    .join("&");
}

export function verifyShopifyQueryHmac(input: {
  url: URL;
  clientSecret: string;
}) {
  const receivedHmac = input.url.searchParams.get("hmac")?.trim().toLowerCase() ?? "";
  if (!receivedHmac) return false;

  const message = buildSignedQueryMessage(input.url);
  const expectedHmac = crypto
    .createHmac("sha256", input.clientSecret)
    .update(message)
    .digest("hex")
    .toLowerCase();

  const expectedBuffer = Buffer.from(expectedHmac, "utf8");
  const receivedBuffer = Buffer.from(receivedHmac, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
