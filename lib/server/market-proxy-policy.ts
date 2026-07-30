export interface MarketProxyPolicy {
  cacheControl: string;
  maxBytes: number;
  url: string;
}

const GATE_PAIR_PATTERN = /^[A-Z0-9]{2,24}_USDT$/;
const OKX_PAIR_PATTERN = /^[A-Z0-9]{2,24}-USDT$/;

export function getProxyPath(
  requestUrl: string,
  routePrefix: string,
): string[] | null {
  const pathname = new URL(requestUrl).pathname;
  const prefix = routePrefix.endsWith("/")
    ? routePrefix.slice(0, -1)
    : routePrefix;
  if (!pathname.startsWith(`${prefix}/`)) return null;

  const suffix = pathname.slice(prefix.length + 1);
  if (!suffix || suffix.includes("//")) return null;

  try {
    const parts = suffix.split("/").map((part) => decodeURIComponent(part));
    if (
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.includes("/") ||
          part.includes("\\"),
      )
    ) {
      return null;
    }
    return parts;
  } catch {
    return null;
  }
}

function hasExactlyOneOfEach(
  searchParams: URLSearchParams,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = [...new Set(searchParams.keys())];
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every(
      (key) => actualKeys.includes(key) && searchParams.getAll(key).length === 1,
    )
  );
}

function getPublicRequestUrl(requestUrl: string): URL {
  const url = new URL(requestUrl);
  // Next.js Edge catch-all routes append their internal `path` values to req.url.
  // The path itself is validated separately from URL.pathname.
  url.searchParams.delete("path");
  return url;
}

export function getGateProxyPolicy(
  path: readonly string[],
  requestUrl: string,
): MarketProxyPolicy | null {
  const url = getPublicRequestUrl(requestUrl);
  const route = path.join("/");

  if (route === "spot/tickers") {
    if ([...url.searchParams.keys()].length !== 0) return null;
    return {
      url: "https://api.gateio.ws/api/v4/spot/tickers",
      cacheControl: "public, s-maxage=20, stale-while-revalidate=60",
      maxBytes: 8 * 1024 * 1024,
    };
  }

  if (route !== "spot/candlesticks") return null;
  if (
    !hasExactlyOneOfEach(url.searchParams, [
      "currency_pair",
      "interval",
      "limit",
    ])
  ) {
    return null;
  }

  const currencyPair = url.searchParams.get("currency_pair") ?? "";
  if (
    !GATE_PAIR_PATTERN.test(currencyPair) ||
    url.searchParams.get("interval") !== "1d" ||
    url.searchParams.get("limit") !== "31"
  ) {
    return null;
  }

  const upstream = new URL("https://api.gateio.ws/api/v4/spot/candlesticks");
  upstream.searchParams.set("currency_pair", currencyPair);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("limit", "31");

  return {
    url: upstream.toString(),
    cacheControl: "public, s-maxage=300, stale-while-revalidate=900",
    maxBytes: 512 * 1024,
  };
}

export function getOkxProxyPolicy(
  path: readonly string[],
  requestUrl: string,
): MarketProxyPolicy | null {
  const url = getPublicRequestUrl(requestUrl);
  const route = path.join("/");

  if (route === "market/tickers") {
    if (
      !hasExactlyOneOfEach(url.searchParams, ["instType"]) ||
      url.searchParams.get("instType") !== "SPOT"
    ) {
      return null;
    }
    return {
      url: "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
      cacheControl: "public, s-maxage=20, stale-while-revalidate=60",
      maxBytes: 4 * 1024 * 1024,
    };
  }

  if (route !== "market/candles") return null;
  if (
    !hasExactlyOneOfEach(url.searchParams, ["instId", "bar", "limit"])
  ) {
    return null;
  }

  const instrumentId = url.searchParams.get("instId") ?? "";
  if (
    !OKX_PAIR_PATTERN.test(instrumentId) ||
    url.searchParams.get("bar") !== "1D" ||
    url.searchParams.get("limit") !== "31"
  ) {
    return null;
  }

  const upstream = new URL("https://www.okx.com/api/v5/market/candles");
  upstream.searchParams.set("instId", instrumentId);
  upstream.searchParams.set("bar", "1D");
  upstream.searchParams.set("limit", "31");

  return {
    url: upstream.toString(),
    cacheControl: "public, s-maxage=300, stale-while-revalidate=900",
    maxBytes: 512 * 1024,
  };
}

export function getCoinGeckoProxyPolicy(
  path: readonly string[],
  requestUrl: string,
  allowedCoinIds: ReadonlySet<string>,
  apiBaseUrl: string,
): MarketProxyPolicy | null {
  const url = getPublicRequestUrl(requestUrl);
  if (
    path.length !== 3 ||
    path[0] !== "coins" ||
    path[2] !== "market_chart"
  ) {
    return null;
  }

  const coinId = path[1];
  if (!allowedCoinIds.has(coinId)) return null;
  if (
    !hasExactlyOneOfEach(url.searchParams, ["vs_currency", "days"]) ||
    url.searchParams.get("vs_currency") !== "usd" ||
    url.searchParams.get("days") !== "31"
  ) {
    return null;
  }

  const upstream = new URL(
    `coins/${encodeURIComponent(coinId)}/market_chart`,
    `${apiBaseUrl}/`,
  );
  upstream.searchParams.set("vs_currency", "usd");
  upstream.searchParams.set("days", "31");

  return {
    url: upstream.toString(),
    cacheControl: "public, s-maxage=3600, stale-while-revalidate=86400",
    maxBytes: 2 * 1024 * 1024,
  };
}
