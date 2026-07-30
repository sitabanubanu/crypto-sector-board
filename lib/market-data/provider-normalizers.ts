import { z } from "zod";
import {
  CandleSchema,
  MarketQuoteSchema,
  PeriodReferencePricesSchema,
  createDataQuality,
  providerResultSchema,
  type Candle,
  type MarketQuote,
  type PeriodReferencePrices,
  type ProviderIssue,
  type ProviderResult,
} from "./contracts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const LOOKBACK_TOLERANCE_MS = 18 * 60 * 60 * 1000;
const GATE_USDT_PAIR_PATTERN = /^[A-Z0-9]+_USDT$/;
const GATE_SPOT_PAIR_PATTERN = /^[A-Z0-9]+_[A-Z0-9]+$/;
const OKX_USDT_PAIR_PATTERN = /^[A-Z0-9]+-USDT$/;
const OKX_SPOT_PAIR_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+$/;

const FiniteNumberStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)), "Expected a finite number");

const PositiveNumberStringSchema = FiniteNumberStringSchema.refine(
  (value) => Number(value) > 0,
  "Expected a positive number",
);

const NonNegativeNumberStringSchema = FiniteNumberStringSchema.refine(
  (value) => Number(value) >= 0,
  "Expected a non-negative number",
);

const EpochStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Expected an integer timestamp")
  .refine((value) => Number.isSafeInteger(Number(value)), "Timestamp is out of range");

export const GateTickerSchema = z
  .object({
    currency_pair: z.string().regex(GATE_USDT_PAIR_PATTERN),
    last: NonNegativeNumberStringSchema,
    high_24h: NonNegativeNumberStringSchema,
    low_24h: NonNegativeNumberStringSchema,
    base_volume: NonNegativeNumberStringSchema,
    quote_volume: NonNegativeNumberStringSchema,
    change_percentage: FiniteNumberStringSchema,
  })
  .passthrough();

export const GateCandleRowSchema = z
  .tuple([
    EpochStringSchema,
    NonNegativeNumberStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    NonNegativeNumberStringSchema,
    z.enum(["true", "false"]),
  ])
  .readonly();

export const OkxTickerSchema = z
  .object({
    instId: z.string().regex(OKX_USDT_PAIR_PATTERN),
    last: NonNegativeNumberStringSchema,
    open24h: NonNegativeNumberStringSchema,
    high24h: NonNegativeNumberStringSchema,
    low24h: NonNegativeNumberStringSchema,
    volCcy24h: NonNegativeNumberStringSchema,
    ts: EpochStringSchema,
  })
  .passthrough();

export const OkxCandleRowSchema = z
  .tuple([
    EpochStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    PositiveNumberStringSchema,
    NonNegativeNumberStringSchema,
    NonNegativeNumberStringSchema,
    NonNegativeNumberStringSchema,
    z.enum(["0", "1"]),
  ])
  .readonly();

export const CoinGeckoMarketItemSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    name: z.string().min(1),
    market_cap: z.number().finite().nonnegative().nullable(),
    current_price: z.number().finite().positive().nullable(),
    high_24h: z.number().finite().positive().nullable(),
    low_24h: z.number().finite().positive().nullable(),
    total_volume: z.number().finite().nonnegative().nullable(),
    price_change_percentage_24h: z.number().finite().nullable(),
    price_change_percentage_7d_in_currency: z.number().finite().nullable(),
    price_change_percentage_30d_in_currency: z.number().finite().nullable(),
    ath: z.number().finite().nullable(),
    atl: z.number().finite().nullable(),
    last_updated: z.string().datetime({ offset: true }),
  })
  .passthrough();

export const CoinGeckoMarketChartSchema = z
  .object({
    prices: z.array(z.tuple([z.number().finite(), z.number().finite().positive()])),
  })
  .passthrough();

export type GateTicker = z.infer<typeof GateTickerSchema>;
export type OkxTickerPayload = z.infer<typeof OkxTickerSchema>;
export type CoinMarketItem = z.infer<typeof CoinGeckoMarketItemSchema>;

function finiteNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: string): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: string): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function percentToRatio(value: string): number | null {
  const parsed = finiteNumber(value);
  return parsed == null ? null : parsed / 100;
}

function isoFromEpoch(value: string, unit: "seconds" | "milliseconds"): string | null {
  const parsed = finiteNumber(value);
  if (parsed == null) return null;
  const timestamp = unit === "seconds" ? parsed * 1000 : parsed;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function providerStatus(valid: number, total: number): ProviderResult<unknown>["status"] {
  if (total <= 0 || valid === 0) return "failed";
  return valid === total ? "success" : "partial";
}

function issueFromZod(error: z.ZodError, item?: string | number): ProviderIssue {
  return {
    code: "invalid_provider_payload",
    message: error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "item"}: ${issue.message}`)
      .join("; "),
    item,
  };
}

function qualityForParse(
  provider: "gate" | "okx" | "coingecko",
  fetchedAt: string,
  valid: number,
  total: number,
) {
  return createDataQuality({
    asOf: fetchedAt,
    generatedAt: fetchedAt,
    sources: [provider],
    fallbackAssets: [],
    missingAssets: [],
    coverageRatio: total === 0 ? 0 : valid / total,
    isStale: false,
    staleAfterSeconds: 120,
    sourceAsOf: { [provider]: fetchedAt },
    staleSources: [],
  });
}

function gateTickerIsKnownNonTarget(item: unknown): boolean {
  const identity = z
    .object({ currency_pair: z.string() })
    .passthrough()
    .safeParse(item);
  if (!identity.success) return false;

  const pair = identity.data.currency_pair;
  const supportedUsdtPair = GATE_USDT_PAIR_PATTERN.test(pair);
  const standardNonUsdtPair =
    GATE_SPOT_PAIR_PATTERN.test(pair) && !pair.endsWith("_USDT");
  const unsupportedUsdtPair = pair.endsWith("_USDT") && !supportedUsdtPair;
  return standardNonUsdtPair || unsupportedUsdtPair;
}

function okxTickerIsKnownNonTarget(item: unknown): boolean {
  const identity = z
    .object({ instId: z.string() })
    .passthrough()
    .safeParse(item);
  return (
    identity.success &&
    OKX_SPOT_PAIR_PATTERN.test(identity.data.instId) &&
    !OKX_USDT_PAIR_PATTERN.test(identity.data.instId)
  );
}

function addEmptyPayloadIssue(
  errors: ProviderIssue[],
  candidateCount: number,
): void {
  if (candidateCount === 0) {
    errors.push({
      code: "empty_provider_payload",
      message: "No target records were present in the provider payload",
    });
  }
}

export function parseGateTickersPayload(
  input: unknown,
  fetchedAt = new Date().toISOString(),
): ProviderResult<GateTicker[]> {
  if (!Array.isArray(input)) {
    return providerResultSchema(z.array(GateTickerSchema)).parse({
      provider: "gate",
      status: "failed",
      data: [],
      quality: qualityForParse("gate", fetchedAt, 0, 1),
      errors: [{ code: "invalid_provider_payload", message: "Expected an array" }],
    });
  }

  const data: GateTicker[] = [];
  const errors: ProviderIssue[] = [];
  let candidateCount = 0;
  input.forEach((item, index) => {
    if (gateTickerIsKnownNonTarget(item)) return;
    candidateCount += 1;
    const parsed = GateTickerSchema.safeParse(item);
    if (parsed.success) data.push(parsed.data);
    else errors.push(issueFromZod(parsed.error, index));
  });
  addEmptyPayloadIssue(errors, candidateCount);

  return providerResultSchema(z.array(GateTickerSchema)).parse({
    provider: "gate",
    status: providerStatus(data.length, candidateCount),
    data,
    quality: qualityForParse("gate", fetchedAt, data.length, candidateCount),
    errors,
  });
}

export function normalizeGateTicker(
  input: unknown,
  assetId: string,
  fetchedAt = new Date().toISOString(),
  fallbackUsed = false,
): MarketQuote {
  const ticker = GateTickerSchema.parse(input);
  return MarketQuoteSchema.parse({
    assetId,
    provider: "gate",
    instrumentId: ticker.currency_pair,
    observedAt: fetchedAt,
    fetchedAt,
    price: positiveNumber(ticker.last),
    open24h: null,
    high24h: positiveNumber(ticker.high_24h),
    low24h: positiveNumber(ticker.low_24h),
    volume24h: nonNegativeNumber(ticker.quote_volume),
    marketCapUsd: null,
    change24h: percentToRatio(ticker.change_percentage),
    fallbackUsed,
  });
}

function gateCandleFromRow(
  row: z.infer<typeof GateCandleRowSchema>,
  assetId: string,
  instrumentId: string,
  fetchedAt: string,
  timeframe: Candle["timeframe"],
): Candle | null {
  const openTime = isoFromEpoch(row[0], "seconds");
  if (!openTime) return null;
  const intervalMs = timeframe === "1h" ? HOUR_MS : DAY_MS;
  return CandleSchema.parse({
    assetId,
    provider: "gate",
    instrumentId,
    timeframe,
    openTime,
    closeTime: new Date(new Date(openTime).getTime() + intervalMs).toISOString(),
    fetchedAt,
    isComplete: row[7] === "true",
    open: positiveNumber(row[5]),
    high: positiveNumber(row[3]),
    low: positiveNumber(row[4]),
    close: positiveNumber(row[2]),
    volume: nonNegativeNumber(row[6]),
    quoteVolume: nonNegativeNumber(row[1]),
  });
}

export function parseGateCandlesPayload(
  input: unknown,
  assetId: string,
  instrumentId: string,
  fetchedAt = new Date().toISOString(),
  timeframe: Candle["timeframe"] = "1d",
): ProviderResult<Candle[]> {
  if (!Array.isArray(input)) {
    return providerResultSchema(z.array(CandleSchema)).parse({
      provider: "gate",
      status: "failed",
      data: [],
      quality: qualityForParse("gate", fetchedAt, 0, 1),
      errors: [{ code: "invalid_provider_payload", message: "Expected an array" }],
    });
  }

  const data: Candle[] = [];
  const errors: ProviderIssue[] = [];
  input.forEach((item, index) => {
    const row = GateCandleRowSchema.safeParse(item);
    if (!row.success) {
      errors.push(issueFromZod(row.error, index));
      return;
    }
    const candle = gateCandleFromRow(
      row.data,
      assetId,
      instrumentId,
      fetchedAt,
      timeframe,
    );
    if (candle) data.push(candle);
    else errors.push({ code: "invalid_timestamp", message: "Invalid candle timestamp", item: index });
  });
  addEmptyPayloadIssue(errors, input.length);
  data.sort((a, b) => b.openTime.localeCompare(a.openTime));

  return providerResultSchema(z.array(CandleSchema)).parse({
    provider: "gate",
    status: providerStatus(data.length, input.length),
    data,
    quality: qualityForParse("gate", fetchedAt, data.length, input.length),
    errors,
  });
}

export function normalizeOkxTicker(
  input: unknown,
  assetId: string,
  fetchedAt = new Date().toISOString(),
  fallbackUsed = false,
): MarketQuote {
  const ticker = OkxTickerSchema.parse(input);
  const price = positiveNumber(ticker.last);
  const open24h = positiveNumber(ticker.open24h);
  const change24h =
    price != null && open24h != null ? price / open24h - 1 : null;

  return MarketQuoteSchema.parse({
    assetId,
    provider: "okx",
    instrumentId: ticker.instId,
    observedAt: isoFromEpoch(ticker.ts, "milliseconds") ?? fetchedAt,
    fetchedAt,
    price,
    open24h,
    high24h: positiveNumber(ticker.high24h),
    low24h: positiveNumber(ticker.low24h),
    volume24h: nonNegativeNumber(ticker.volCcy24h),
    marketCapUsd: null,
    change24h,
    fallbackUsed,
  });
}

export function parseOkxTickersPayload(
  input: unknown,
  fetchedAt = new Date().toISOString(),
): ProviderResult<OkxTickerPayload[]> {
  const envelope = z
    .object({
      code: z.string(),
      data: z.array(z.unknown()),
    })
    .passthrough()
    .safeParse(input);

  if (!envelope.success || envelope.data.code !== "0") {
    return providerResultSchema(z.array(OkxTickerSchema)).parse({
      provider: "okx",
      status: "failed",
      data: [],
      quality: qualityForParse("okx", fetchedAt, 0, 1),
      errors: [
        envelope.success
          ? { code: "provider_error", message: `OKX returned code ${envelope.data.code}` }
          : issueFromZod(envelope.error),
      ],
    });
  }

  const data: OkxTickerPayload[] = [];
  const errors: ProviderIssue[] = [];
  let candidateCount = 0;
  envelope.data.data.forEach((item, index) => {
    if (okxTickerIsKnownNonTarget(item)) return;
    candidateCount += 1;
    const parsed = OkxTickerSchema.safeParse(item);
    if (parsed.success) data.push(parsed.data);
    else errors.push(issueFromZod(parsed.error, index));
  });
  addEmptyPayloadIssue(errors, candidateCount);

  return providerResultSchema(z.array(OkxTickerSchema)).parse({
    provider: "okx",
    status: providerStatus(data.length, candidateCount),
    data,
    quality: qualityForParse("okx", fetchedAt, data.length, candidateCount),
    errors,
  });
}

function okxCandleFromRow(
  row: z.infer<typeof OkxCandleRowSchema>,
  assetId: string,
  instrumentId: string,
  fetchedAt: string,
  timeframe: Candle["timeframe"],
): Candle | null {
  const openTime = isoFromEpoch(row[0], "milliseconds");
  if (!openTime) return null;
  const intervalMs = timeframe === "1h" ? HOUR_MS : DAY_MS;
  return CandleSchema.parse({
    assetId,
    provider: "okx",
    instrumentId,
    timeframe,
    openTime,
    closeTime: new Date(new Date(openTime).getTime() + intervalMs).toISOString(),
    fetchedAt,
    isComplete: row[8] === "1",
    open: positiveNumber(row[1]),
    high: positiveNumber(row[2]),
    low: positiveNumber(row[3]),
    close: positiveNumber(row[4]),
    volume: nonNegativeNumber(row[5]),
    quoteVolume: nonNegativeNumber(row[7]),
  });
}

export function parseOkxCandlesPayload(
  input: unknown,
  assetId: string,
  instrumentId: string,
  fetchedAt = new Date().toISOString(),
  timeframe: Candle["timeframe"] = "1d",
): ProviderResult<Candle[]> {
  const envelope = z
    .object({
      code: z.string(),
      data: z.array(z.unknown()),
    })
    .passthrough()
    .safeParse(input);

  if (!envelope.success || envelope.data.code !== "0") {
    return providerResultSchema(z.array(CandleSchema)).parse({
      provider: "okx",
      status: "failed",
      data: [],
      quality: qualityForParse("okx", fetchedAt, 0, 1),
      errors: [
        envelope.success
          ? { code: "provider_error", message: `OKX returned code ${envelope.data.code}` }
          : issueFromZod(envelope.error),
      ],
    });
  }

  const data: Candle[] = [];
  const errors: ProviderIssue[] = [];
  envelope.data.data.forEach((item, index) => {
    const row = OkxCandleRowSchema.safeParse(item);
    if (!row.success) {
      errors.push(issueFromZod(row.error, index));
      return;
    }
    const candle = okxCandleFromRow(
      row.data,
      assetId,
      instrumentId,
      fetchedAt,
      timeframe,
    );
    if (candle) data.push(candle);
    else errors.push({ code: "invalid_timestamp", message: "Invalid candle timestamp", item: index });
  });
  addEmptyPayloadIssue(errors, envelope.data.data.length);
  data.sort((a, b) => b.openTime.localeCompare(a.openTime));

  return providerResultSchema(z.array(CandleSchema)).parse({
    provider: "okx",
    status: providerStatus(data.length, envelope.data.data.length),
    data,
    quality: qualityForParse("okx", fetchedAt, data.length, envelope.data.data.length),
    errors,
  });
}

export function parseCoinGeckoMarketsPayload(
  input: unknown,
  fetchedAt = new Date().toISOString(),
): ProviderResult<CoinMarketItem[]> {
  if (!Array.isArray(input)) {
    return providerResultSchema(z.array(CoinGeckoMarketItemSchema)).parse({
      provider: "coingecko",
      status: "failed",
      data: [],
      quality: qualityForParse("coingecko", fetchedAt, 0, 1),
      errors: [{ code: "invalid_provider_payload", message: "Expected an array" }],
    });
  }

  const data: CoinMarketItem[] = [];
  const errors: ProviderIssue[] = [];
  input.forEach((item, index) => {
    const parsed = CoinGeckoMarketItemSchema.safeParse(item);
    if (parsed.success) data.push(parsed.data);
    else errors.push(issueFromZod(parsed.error, index));
  });
  addEmptyPayloadIssue(errors, input.length);

  return providerResultSchema(z.array(CoinGeckoMarketItemSchema)).parse({
    provider: "coingecko",
    status: providerStatus(data.length, input.length),
    data,
    quality: qualityForParse("coingecko", fetchedAt, data.length, input.length),
    errors,
  });
}

export function normalizeCoinGeckoMarket(
  input: unknown,
  fetchedAt = new Date().toISOString(),
  fallbackUsed = false,
): MarketQuote {
  const item = CoinGeckoMarketItemSchema.parse(input);
  return MarketQuoteSchema.parse({
    assetId: item.id,
    provider: "coingecko",
    instrumentId: item.id,
    observedAt: item.last_updated,
    fetchedAt,
    price: item.current_price,
    open24h: null,
    high24h: item.high_24h,
    low24h: item.low_24h,
    volume24h: item.total_volume,
    marketCapUsd: item.market_cap,
    change24h:
      item.price_change_percentage_24h == null
        ? null
        : item.price_change_percentage_24h / 100,
    fallbackUsed,
  });
}

export function extractCoinGeckoPeriodPrices(input: unknown): PeriodReferencePrices {
  const chart = CoinGeckoMarketChartSchema.parse(input);
  const prices = [...chart.prices].sort((a, b) => a[0] - b[0]);
  const latest = prices.at(-1);
  if (!latest) {
    return PeriodReferencePricesSchema.parse({
      asOf: new Date(0).toISOString(),
      current: null,
      price3d: null,
      price7d: null,
      price30d: null,
    });
  }

  const nearestPrice = (days: number): number | null => {
    const target = latest[0] - days * DAY_MS;
    let best: [number, number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of prices) {
      const distance = Math.abs(point[0] - target);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    return best && bestDistance <= LOOKBACK_TOLERANCE_MS ? best[1] : null;
  };

  return PeriodReferencePricesSchema.parse({
    asOf: new Date(latest[0]).toISOString(),
    current: latest[1],
    price3d: nearestPrice(3),
    price7d: nearestPrice(7),
    price30d: nearestPrice(30),
  });
}
