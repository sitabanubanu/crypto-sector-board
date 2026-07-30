import {
  normalizeCoinGeckoMarket,
  normalizeGateTicker,
  normalizeOkxTicker,
  parseCoinGeckoMarketsPayload,
  parseGateCandlesPayload,
  parseGateTickersPayload,
  parseOkxCandlesPayload,
  parseOkxTickersPayload,
} from "@/lib/market-data/provider-normalizers";
import { fetchJsonWithRetry, type FetchJsonOptions } from "./http";
import type {
  ActiveInstrument,
  CandleFetchRequest,
  CandleFetchResult,
  ProviderCandleAdapter,
  ProviderQuoteAdapter,
  QuoteFetchResult,
} from "./types";

const GATE_API_BASE = "https://api.gateio.ws/api/v4";
const OKX_API_BASE = "https://www.okx.com/api/v5";
const COINGECKO_PUBLIC_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";

type AdapterHttpOptions = Pick<
  FetchJsonOptions,
  "fetcher" | "retries" | "retryBaseMs" | "sleep" | "timeoutMs"
>;

function inRequestedRange(
  openTime: string,
  request: CandleFetchRequest,
): boolean {
  const time = Date.parse(openTime);
  return (
    time >= request.from.getTime() && time < request.toExclusive.getTime()
  );
}

function uniqueCompleteCandles(
  candles: CandleFetchResult["candles"],
  request: CandleFetchRequest,
) {
  const byOpenTime = new Map(
    candles
      .filter(
        (candle) =>
          candle.isComplete &&
          candle.open != null &&
          candle.high != null &&
          candle.low != null &&
          candle.close != null &&
          inRequestedRange(candle.openTime, request),
      )
      .map((candle) => [candle.openTime, candle]),
  );
  return [...byOpenTime.values()].sort((left, right) =>
    left.openTime.localeCompare(right.openTime),
  );
}

export function createGateCandleAdapter(
  httpOptions: AdapterHttpOptions = {},
): ProviderCandleAdapter {
  return {
    provider: "gate",
    minimumDelayMs: 40,
    async fetchCandles(request) {
      const url = new URL(`${GATE_API_BASE}/spot/candlesticks`);
      url.searchParams.set("currency_pair", request.instrumentId);
      url.searchParams.set("interval", "1h");
      url.searchParams.set(
        "from",
        String(Math.floor(request.from.getTime() / 1_000)),
      );
      url.searchParams.set(
        "to",
        String(Math.floor((request.toExclusive.getTime() - 1) / 1_000)),
      );
      const fetchedAt = new Date().toISOString();
      const parsed = parseGateCandlesPayload(
        await fetchJsonWithRetry(url.toString(), {
          ...httpOptions,
          maxBytes: 2 * 1024 * 1024,
        }),
        request.assetId,
        request.instrumentId,
        fetchedAt,
        "1h",
      );
      if (parsed.status === "failed") {
        throw new Error(
          `Gate candle payload failed validation: ${parsed.errors[0]?.message ?? "unknown error"}`,
        );
      }
      return {
        candles: uniqueCompleteCandles(parsed.data, request),
        issues: parsed.errors,
      };
    },
  };
}

export function createOkxCandleAdapter(
  httpOptions: AdapterHttpOptions = {},
): ProviderCandleAdapter {
  return {
    provider: "okx",
    minimumDelayMs: 110,
    async fetchCandles(request) {
      const collected: CandleFetchResult["candles"] = [];
      const issues: CandleFetchResult["issues"] = [];
      let after: string | null = null;
      const maxPages = Math.max(
        1,
        Math.ceil(
          (request.toExclusive.getTime() - request.from.getTime()) /
            (300 * 60 * 60 * 1_000),
        ) + 1,
      );

      for (let page = 0; page < maxPages; page += 1) {
        const url = new URL(`${OKX_API_BASE}/market/history-candles`);
        url.searchParams.set("instId", request.instrumentId);
        url.searchParams.set("bar", "1H");
        url.searchParams.set("limit", "300");
        if (after) url.searchParams.set("after", after);

        const fetchedAt = new Date().toISOString();
        const parsed = parseOkxCandlesPayload(
          await fetchJsonWithRetry(url.toString(), {
            ...httpOptions,
            maxBytes: 2 * 1024 * 1024,
          }),
          request.assetId,
          request.instrumentId,
          fetchedAt,
          "1h",
        );
        if (parsed.status === "failed") {
          throw new Error(
            `OKX candle payload failed validation: ${parsed.errors[0]?.message ?? "unknown error"}`,
          );
        }

        collected.push(...parsed.data);
        issues.push(...parsed.errors);
        const oldest = parsed.data.at(-1);
        if (
          !oldest ||
          Date.parse(oldest.openTime) <= request.from.getTime() ||
          parsed.data.length < 300
        ) {
          break;
        }
        const nextAfter = String(Date.parse(oldest.openTime));
        if (nextAfter === after) break;
        after = nextAfter;
      }

      return {
        candles: uniqueCompleteCandles(collected, request),
        issues,
      };
    },
  };
}

function quoteRecordIssues(
  instruments: ActiveInstrument[],
  found: ReadonlySet<string>,
  usable: ReadonlySet<string>,
) {
  return instruments.flatMap((instrument) => {
    if (!found.has(instrument.instrumentId)) {
      return [
        {
          assetId: instrument.assetId,
          code: "missing_provider_record",
          message: "The provider did not return this registered instrument.",
          item: instrument.instrumentId,
        },
      ];
    }
    return usable.has(instrument.instrumentId)
      ? []
      : [
          {
            assetId: instrument.assetId,
            code: "unusable_provider_record",
            message:
              "The provider returned this instrument without a usable positive price.",
            item: instrument.instrumentId,
          },
        ];
  });
}

export function createGateQuoteAdapter(
  httpOptions: AdapterHttpOptions = {},
): ProviderQuoteAdapter {
  return {
    provider: "gate",
    async fetchQuotes(instruments): Promise<QuoteFetchResult> {
      const fetchedAt = new Date().toISOString();
      const parsed = parseGateTickersPayload(
        await fetchJsonWithRetry(`${GATE_API_BASE}/spot/tickers`, {
          ...httpOptions,
          maxBytes: 8 * 1024 * 1024,
        }),
        fetchedAt,
      );
      if (parsed.status === "failed") {
        throw new Error(
          `Gate ticker payload failed validation: ${parsed.errors[0]?.message ?? "unknown error"}`,
        );
      }
      const requested = new Map(
        instruments.map((item) => [item.instrumentId, item]),
      );
      const selected = parsed.data.filter((item) =>
        requested.has(item.currency_pair),
      );
      const found = new Set(selected.map((item) => item.currency_pair));
      const quotes = selected.flatMap((item) => {
        const instrument = requested.get(item.currency_pair);
        if (!instrument) return [];
        const quote = normalizeGateTicker(item, instrument.assetId, fetchedAt);
        return quote.price == null ? [] : [quote];
      });
      const usable = new Set(quotes.map((quote) => quote.instrumentId));
      return {
        quotes,
        issues: [
          ...parsed.errors,
          ...quoteRecordIssues(instruments, found, usable),
        ],
      };
    },
  };
}

export function createOkxQuoteAdapter(
  httpOptions: AdapterHttpOptions = {},
): ProviderQuoteAdapter {
  return {
    provider: "okx",
    async fetchQuotes(instruments): Promise<QuoteFetchResult> {
      const fetchedAt = new Date().toISOString();
      const parsed = parseOkxTickersPayload(
        await fetchJsonWithRetry(
          `${OKX_API_BASE}/market/tickers?instType=SPOT`,
          { ...httpOptions, maxBytes: 8 * 1024 * 1024 },
        ),
        fetchedAt,
      );
      if (parsed.status === "failed") {
        throw new Error(
          `OKX ticker payload failed validation: ${parsed.errors[0]?.message ?? "unknown error"}`,
        );
      }
      const requested = new Map(
        instruments.map((item) => [item.instrumentId, item]),
      );
      const selected = parsed.data.filter((item) =>
        requested.has(item.instId),
      );
      const found = new Set(selected.map((item) => item.instId));
      const quotes = selected.flatMap((item) => {
        const instrument = requested.get(item.instId);
        if (!instrument) return [];
        const quote = normalizeOkxTicker(item, instrument.assetId, fetchedAt);
        return quote.price == null ? [] : [quote];
      });
      const usable = new Set(quotes.map((quote) => quote.instrumentId));
      return {
        quotes,
        issues: [
          ...parsed.errors,
          ...quoteRecordIssues(instruments, found, usable),
        ],
      };
    },
  };
}

export function createCoinGeckoQuoteAdapter(
  httpOptions: AdapterHttpOptions = {},
): ProviderQuoteAdapter {
  return {
    provider: "coingecko",
    async fetchQuotes(instruments): Promise<QuoteFetchResult> {
      const apiKey = process.env.COINGECKO_API_KEY?.trim();
      const baseUrl = apiKey ? COINGECKO_PRO_BASE : COINGECKO_PUBLIC_BASE;
      const headers = apiKey ? { "x-cg-pro-api-key": apiKey } : undefined;
      const quotes: QuoteFetchResult["quotes"] = [];
      const issues: QuoteFetchResult["issues"] = [];
      const found = new Set<string>();
      const usable = new Set<string>();

      for (let offset = 0; offset < instruments.length; offset += 50) {
        const batch = instruments.slice(offset, offset + 50);
        const url = new URL(`${baseUrl}/coins/markets`);
        url.searchParams.set("vs_currency", "usd");
        url.searchParams.set(
          "ids",
          batch.map((item) => item.instrumentId).join(","),
        );
        url.searchParams.set("order", "market_cap_desc");
        url.searchParams.set("per_page", String(batch.length));
        url.searchParams.set("page", "1");
        url.searchParams.set("sparkline", "false");
        url.searchParams.set(
          "price_change_percentage",
          "24h,7d,30d",
        );

        const fetchedAt = new Date().toISOString();
        const parsed = parseCoinGeckoMarketsPayload(
          await fetchJsonWithRetry(url.toString(), {
            ...httpOptions,
            headers,
            maxBytes: 4 * 1024 * 1024,
          }),
          fetchedAt,
        );
        if (parsed.status === "failed") {
          issues.push(...parsed.errors);
          continue;
        }
        issues.push(...parsed.errors);
        const requested = new Map(
          batch.map((item) => [item.instrumentId, item]),
        );
        for (const item of parsed.data) {
          const instrument = requested.get(item.id);
          if (!instrument) continue;
          found.add(item.id);
          const quote = normalizeCoinGeckoMarket(item, fetchedAt);
          if (quote.price != null) {
            usable.add(item.id);
            quotes.push({ ...quote, assetId: instrument.assetId });
          }
        }
      }

      issues.push(...quoteRecordIssues(instruments, found, usable));
      return { quotes, issues };
    },
  };
}

export function createDefaultCandleAdapters(): ProviderCandleAdapter[] {
  return [createGateCandleAdapter(), createOkxCandleAdapter()];
}

export function createDefaultQuoteAdapters(): ProviderQuoteAdapter[] {
  return [
    createCoinGeckoQuoteAdapter(),
    createGateQuoteAdapter(),
    createOkxQuoteAdapter(),
  ];
}
