import crypto from "crypto";

function stripHmacParams(parts: string[]) {
  return parts.filter((part) => {
    const [rawKey = ""] = part.split("=", 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
    return key !== "hmac" && key !== "signature";
  });
}

function getRawQueryParts(url: URL) {
  return url.search
    .replace(/^\?/, "")
    .split("&")
    .filter(Boolean)
}

function buildRawSortedMessage(url: URL) {
  return stripHmacParams(getRawQueryParts(url))
    .sort((a, b) => a.localeCompare(b))
    .join("&");
}

function buildDecodedSortedMessage(url: URL) {
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function buildRawPreservedOrderMessage(url: URL) {
  return stripHmacParams(getRawQueryParts(url)).join("&");
}

function buildExpectedHmac(message: string, clientSecret: string) {
  return crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex")
    .toLowerCase();
}

export function verifyShopifyQueryHmac(input: {
  url: URL;
  clientSecret: string;
}) {
  const receivedHmac = input.url.searchParams.get("hmac")?.trim().toLowerCase() ?? "";
  if (!receivedHmac) return false;

  const receivedBuffer = Buffer.from(receivedHmac, "utf8");
  const candidateMessages = [
    buildRawSortedMessage(input.url),
    buildDecodedSortedMessage(input.url),
    buildRawPreservedOrderMessage(input.url),
  ];

  return candidateMessages.some((message) => {
    const expectedBuffer = Buffer.from(
      buildExpectedHmac(message, input.clientSecret),
      "utf8",
    );
    return (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  });
}
