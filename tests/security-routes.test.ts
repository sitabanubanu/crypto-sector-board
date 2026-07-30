import { expect, test } from "vitest";
import { POST as updateSectors } from "../app/api/sectors/route";
import { GET as getSnapshots } from "../app/api/snapshots/route";
import {
  getCoinGeckoProxyPolicy,
  getGateProxyPolicy,
  getOkxProxyPolicy,
  getProxyPath,
} from "../lib/server/market-proxy-policy";
import { isValidSnapshotId } from "../lib/server/snapshot-id";
import { isAllowedBrowserRequest } from "../lib/server/upstream-json";

test("sector updates are disabled until authenticated administration exists", async () => {
  const response = await updateSectors();

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
});

test("snapshot ids accept only real day or hourly filenames", () => {
  expect(isValidSnapshotId("2026-05-15")).toBe(true);
  expect(isValidSnapshotId("2026-05-15T16")).toBe(true);
  expect(isValidSnapshotId("2026-02-29")).toBe(false);
  expect(isValidSnapshotId("2026-05-15T24")).toBe(false);
  expect(isValidSnapshotId("../../package")).toBe(false);
  expect(isValidSnapshotId("2026-05-15/../../package")).toBe(false);
});

test("snapshot route rejects traversal before touching the filesystem", async () => {
  const response = await getSnapshots(
    new Request(
      "http://localhost/api/snapshots?date=..%2F..%2Fpackage",
    ),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid snapshot id" });
});

test("Gate proxy accepts only the two dashboard contracts", () => {
  expect(
    getGateProxyPolicy(
      ["spot", "tickers"],
      "http://localhost/api/gate/spot/tickers?path=spot&path=tickers",
    ),
  ).toBeTruthy();
  expect(
    getGateProxyPolicy(
      ["spot", "candlesticks"],
      "http://localhost/api/gate/spot/candlesticks?currency_pair=BTC_USDT&interval=1d&limit=31&path=spot&path=candlesticks",
    ),
  ).toBeTruthy();
  expect(
    getGateProxyPolicy(
      ["wallet", "withdrawals"],
      "http://localhost/api/gate/wallet/withdrawals",
    ),
  ).toBeNull();
  expect(
    getGateProxyPolicy(
      ["spot", "candlesticks"],
      "http://localhost/api/gate/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&limit=1000",
    ),
  ).toBeNull();
});

test("proxy paths are derived from the actual URL and reject encoded separators", () => {
  expect(
    getProxyPath(
      "http://localhost/api/gate/spot/tickers",
      "/api/gate",
    ),
  ).toEqual(["spot", "tickers"]);
  expect(
    getProxyPath(
      "http://localhost/api/gate/spot%2Ftickers",
      "/api/gate",
    ),
  ).toBeNull();
  expect(
    getProxyPath(
      "http://localhost/api/gate/../sectors",
      "/api/gate",
    ),
  ).toBeNull();
});

test("OKX proxy accepts only fixed public-market requests", () => {
  expect(
    getOkxProxyPolicy(
      ["market", "tickers"],
      "http://localhost/api/okx/market/tickers?instType=SPOT&path=market&path=tickers",
    ),
  ).toBeTruthy();
  expect(
    getOkxProxyPolicy(
      ["market", "candles"],
      "http://localhost/api/okx/market/candles?instId=BTC-USDT&bar=1D&limit=31&path=market&path=candles",
    ),
  ).toBeTruthy();
  expect(
    getOkxProxyPolicy(
      ["account", "balance"],
      "http://localhost/api/okx/account/balance",
    ),
  ).toBeNull();
  expect(
    getOkxProxyPolicy(
      ["market", "candles"],
      "http://localhost/api/okx/market/candles?instId=BTC-USDT&bar=1m&limit=100",
    ),
  ).toBeNull();
});

test("CoinGecko proxy is limited to configured coins and one query shape", () => {
  const allowedCoinIds = new Set(["bitcoin"]);
  const policy = getCoinGeckoProxyPolicy(
    ["coins", "bitcoin", "market_chart"],
    "http://localhost/api/cg/coins/bitcoin/market_chart?vs_currency=usd&days=31&path=coins&path=bitcoin&path=market_chart",
    allowedCoinIds,
    "https://pro-api.coingecko.com/api/v3",
  );

  expect(policy).toBeTruthy();
  expect(new URL(policy!.url).origin).toBe("https://pro-api.coingecko.com");
  expect(
    getCoinGeckoProxyPolicy(
      ["coins", "untracked", "market_chart"],
      "http://localhost/api/cg/coins/untracked/market_chart?vs_currency=usd&days=31",
      allowedCoinIds,
      "https://api.coingecko.com/api/v3",
    ),
  ).toBeNull();
  expect(
    getCoinGeckoProxyPolicy(
      ["coins", "bitcoin", "market_chart"],
      "http://localhost/api/cg/coins/bitcoin/market_chart?vs_currency=eur&days=max",
      allowedCoinIds,
      "https://api.coingecko.com/api/v3",
    ),
  ).toBeNull();
});

test("browser-facing proxy rejects cross-site origins", () => {
  expect(
    isAllowedBrowserRequest(
      new Request("https://dashboard.example/api/gate/spot/tickers", {
        headers: {
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
      }),
    ),
  ).toBe(false);
  expect(
    isAllowedBrowserRequest(
      new Request("https://dashboard.example/api/gate/spot/tickers", {
        headers: {
          Origin: "https://dashboard.example",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
    ),
  ).toBe(true);
});
