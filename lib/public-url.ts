export function isBindAllHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]";
}

export function normalizeBindAllHostForBrowser(value: string) {
  const url = new URL(value);
  if (isBindAllHostname(url.hostname)) {
    url.hostname = "localhost";
  }
  return url.toString();
}

export function normalizeBindAllOriginForBrowser(origin: string) {
  return new URL(normalizeBindAllHostForBrowser(origin)).origin;
}
