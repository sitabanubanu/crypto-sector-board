import { describe, expect, test } from "vitest";
import {
  DataQualitySchema,
  MarketQuoteSchema,
  providerResultSchema,
} from "../lib/market-data/contracts";
import {
  isDataQualityStale,
  isTimestampStale,
} from "../lib/market-data/freshness";
import {
  extractCoinGeckoPeriodPrices,
  normalizeCoinGeckoMarket,
  normalizeGateTicker,
  parseCoinGeckoMarketsPayload,
  parseGateCandlesPayload,
  parseGateTickersPayload,
  parseOkxCandlesPayload,
  parseOkxTickersPayload,
} from "../lib/market-data/provider-normalizers";
import gateTickers from "./fixtures/gate/tickers.json";
import gateCandles from "./fixtures/gate/candles.json";
import okxCandles from "./fixtures/okx/candles.json";
import okxTickers from "./fixtures/okx/tickers.json";
import coinGeckoMarkets from "./fixtures/coingecko/markets.json";
import coinGeckoMarketChart from "./fixtures/coingecko/market-chart.json";

const fetchedAt = "2026-07-29T16:15:00.000Z";

describe("shared market-data contracts", () => {
  test("MarketQuote distinguishes a real zero return from a missing open", () => {
    const quote = normalizeGateTicker(gateTickers[0], "bitcoin", fetchedAt);

    expect(MarketQuoteSchema.parse(quote)).toEqual(quote);
    expect(quote.change24h).toBe(0);
    expect(quote.open24h).toBeNull();
    expect(quote.price).toBe(64000);
  });

  test("DataQuality rejects impossible coverage", () => {
    expect(() =>
      DataQualitySchema.parse({
        asOf: fetchedAt,
        generatedAt: fetchedAt,
        sources: ["gate"],
        fallbackAssets: [],
        missingAssets: [],
        coverageRatio: 1.01,
        isStale: false,
        staleAfterSeconds: 90,
      }),
    ).toThrow();
  });

  test("DataQuality rejects future or undeclared source timestamps", () => {
    expect(() =>
      DataQualitySchema.parse({
        asOf: "2026-07-29T16:16:00.000Z",
        generatedAt: fetchedAt,
        sources: ["gate"],
        fallbackAssets: [],
        missingAssets: [],
        coverageRatio: 1,
        isStale: false,
        staleAfterSeconds: 90,
      }),
    ).toThrow();

    expect(() =>
      DataQualitySchema.parse({
        asOf: fetchedAt,
        generatedAt: fetchedAt,
        sources: ["gate"],
        fallbackAssets: [],
        missingAssets: [],
        coverageRatio: 1,
        isStale: false,
        staleAfterSeconds: 90,
        sourceAsOf: { snapshot: fetchedAt },
      }),
    ).toThrow();
  });

  test("ProviderResult rejects a data shape that violates its schema", () => {
    const schema = providerResultSchema(MarketQuoteSchema.array());
    expect(() =>
      schema.parse({
        provider: "gate",
        status: "success",
        data: [{ provider: "gate" }],
        quality: {
          asOf: fetchedAt,
          generatedAt: fetchedAt,
          sources: ["gate"],
          fallbackAssets: [],
          missingAssets: [],
          coverageRatio: 1,
          isStale: false,
          staleAfterSeconds: 90,
        },
        errors: [],
      }),
    ).toThrow();
  });

  test("ProviderResult status must agree with data, errors, and coverage", () => {
    const schema = providerResultSchema(MarketQuoteSchema.array());
    expect(() =>
      schema.parse({
        provider: "gate",
        status: "success",
        data: [
          {
            assetId: "bitcoin",
            provider: "gate",
            instrumentId: "BTC_USDT",
            observedAt: fetchedAt,
            fetchedAt,
            price: 64_000,
            open24h: null,
            high24h: 65_000,
            low24h: 63_000,
            volume24h: 1,
            marketCapUsd: null,
            change24h: 0,
            fallbackUsed: false,
          },
        ],
        quality: {
          asOf: fetchedAt,
          generatedAt: fetchedAt,
          sources: ["gate"],
          fallbackAssets: [],
          missingAssets: [],
          coverageRatio: 0.5,
          isStale: false,
          staleAfterSeconds: 90,
        },
        errors: [{ code: "unexpected", message: "should fail" }],
      }),
    ).toThrow();
  });

  test("freshness is derived from asOf at read time", () => {
    expect(
      isTimestampStale(fetchedAt, 90, Date.parse(fetchedAt) + 89_000),
    ).toBe(false);
    expect(
      isTimestampStale(fetchedAt, 90, Date.parse(fetchedAt) + 91_000),
    ).toBe(true);

    const quality = DataQualitySchema.parse({
      asOf: fetchedAt,
      generatedAt: fetchedAt,
      sources: ["gate"],
      fallbackAssets: [],
      missingAssets: [],
      coverageRatio: 1,
      isStale: false,
      staleAfterSeconds: 90,
    });
    expect(
      isDataQualityStale(quality, Date.parse(fetchedAt) + 91_000),
    ).toBe(true);
  });
});

describe("provider fixtures", () => {
  test("Gate ticker fixture validates and a missing field becomes partial", () => {
    const valid = parseGateTickersPayload(gateTickers, fetchedAt);
    expect(valid.status).toBe("success");
    expect(valid.data).toHaveLength(2);
    expect(valid.errors).toEqual([]);
    expect(valid.quality.coverageRatio).toBe(1);

    const malformed = structuredClone(gateTickers) as Array<Record<string, unknown>>;
    delete malformed[0].last;
    const partial = parseGateTickersPayload(malformed, fetchedAt);
    expect(partial.status).toBe("partial");
    expect(partial.data).toHaveLength(1);
    expect(partial.errors[0]?.code).toBe("invalid_provider_payload");
  });

  test("Gate ignores unrelated quote currencies but rejects bad target numbers", () => {
    const malformed = structuredClone(gateTickers) as Array<Record<string, unknown>>;
    malformed[0].last = "not-a-number";

    const result = parseGateTickersPayload(malformed, fetchedAt);
    expect(result.status).toBe("partial");
    expect(result.data.map((ticker) => ticker.currency_pair)).toEqual([
      "GRAM_USDT",
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.quality.coverageRatio).toBe(0.5);
  });

  test("Gate accepts structurally valid inactive rows and normalizes zero as missing", () => {
    const inactive = {
      currency_pair: "XAR_USDT",
      last: "0",
      high_24h: "0",
      low_24h: "0",
      base_volume: "0",
      quote_volume: "0",
      change_percentage: "0",
    };
    const parsed = parseGateTickersPayload([inactive], fetchedAt);
    const quote = normalizeGateTicker(inactive, "xar", fetchedAt);

    expect(parsed.status).toBe("success");
    expect(parsed.errors).toEqual([]);
    expect(quote.price).toBeNull();
    expect(quote.high24h).toBeNull();
    expect(quote.low24h).toBeNull();
    expect(quote.change24h).toBe(0);
  });

  test("Gate candles normalize to newest-first typed candles", () => {
    const result = parseGateCandlesPayload(
      gateCandles,
      "bitcoin",
      "BTC_USDT",
      fetchedAt,
    );
    expect(result.status).toBe("success");
    expect(result.data).toHaveLength(3);
    expect(result.data[0].close).toBe(63972);
    expect(result.data[0].isComplete).toBe(false);
    expect(result.data[2].isComplete).toBe(true);
  });

  test("Gate rejects a candle row whose provider tuple shape changed", () => {
    const malformed = structuredClone(gateCandles);
    malformed[0] = malformed[0].slice(0, 7);
    const result = parseGateCandlesPayload(
      malformed,
      "bitcoin",
      "BTC_USDT",
      fetchedAt,
    );

    expect(result.status).toBe("partial");
    expect(result.data).toHaveLength(2);
    expect(result.errors[0]?.code).toBe("invalid_provider_payload");
  });

  test("OKX ticker fixture filters non-USDT rows and validates timestamps", () => {
    const valid = parseOkxTickersPayload(okxTickers, fetchedAt);
    expect(valid.status).toBe("success");
    expect(valid.data.map((ticker) => ticker.instId)).toEqual(["BTC-USDT"]);
    expect(valid.errors).toEqual([]);

    const malformed = structuredClone(okxTickers);
    malformed.data[0].last = "not-a-number";
    const failed = parseOkxTickersPayload(malformed, fetchedAt);
    expect(failed.status).toBe("failed");
    expect(failed.data).toEqual([]);
    expect(failed.errors).toHaveLength(1);
  });

  test("OKX candles normalize without relying on network", () => {
    const result = parseOkxCandlesPayload(
      okxCandles,
      "bitcoin",
      "BTC-USDT",
      fetchedAt,
    );
    expect(result.status).toBe("success");
    expect(result.data.map((candle) => candle.close)).toEqual([63976, 63972.4]);
    expect(result.data.map((candle) => candle.isComplete)).toEqual([false, true]);
  });

  test("CoinGecko fixture preserves null and zero fields", () => {
    const result = parseCoinGeckoMarketsPayload(coinGeckoMarkets, fetchedAt);
    expect(result.status).toBe("success");

    const bitcoin = normalizeCoinGeckoMarket(result.data[0], fetchedAt);
    expect(bitcoin.change24h).toBe(0);
    expect(result.data[0].price_change_percentage_7d_in_currency).toBeNull();
  });

  test("CoinGecko lookbacks remain explicit points, not fake daily candles", () => {
    const result = extractCoinGeckoPeriodPrices(coinGeckoMarketChart);

    expect(result.current).toBe(64_000);
    expect(result.price3d).toBe(62_000);
    expect(result.price7d).toBe(61_000);
    expect(result.price30d).toBe(60_000);
    expect(result).not.toHaveProperty("closes");
  });

  test("insufficient history leaves the 30d reference null", () => {
    const latest = Date.parse("2026-07-30T00:00:00.000Z");
    const result = extractCoinGeckoPeriodPrices({
      prices: [
        [latest - 3 * 86_400_000, 90],
        [latest, 100],
      ],
    });
    expect(result.price3d).toBe(90);
    expect(result.price7d).toBeNull();
    expect(result.price30d).toBeNull();
  });
});
