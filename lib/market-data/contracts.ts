import { z } from "zod";

export const MarketDataProviderSchema = z.enum([
  "gate",
  "okx",
  "coingecko",
  "snapshot",
]);

export const SourceAsOfSchema = z
  .object({
    gate: z.string().datetime({ offset: true }).optional(),
    okx: z.string().datetime({ offset: true }).optional(),
    coingecko: z.string().datetime({ offset: true }).optional(),
    snapshot: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const NullableFiniteNumberSchema = z.number().finite().nullable();
export const NullablePositiveNumberSchema = z.number().finite().positive().nullable();
export const NullableNonNegativeNumberSchema = z.number().finite().nonnegative().nullable();

export const MarketQuoteSchema = z
  .object({
    assetId: z.string().min(1),
    provider: MarketDataProviderSchema,
    instrumentId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    fetchedAt: z.string().datetime({ offset: true }),
    price: NullablePositiveNumberSchema,
    open24h: NullablePositiveNumberSchema,
    high24h: NullablePositiveNumberSchema,
    low24h: NullablePositiveNumberSchema,
    volume24h: NullableNonNegativeNumberSchema,
    marketCapUsd: NullableNonNegativeNumberSchema,
    change24h: NullableFiniteNumberSchema,
    fallbackUsed: z.boolean(),
  })
  .strict()
  .superRefine((quote, context) => {
    if (
      quote.high24h != null &&
      quote.low24h != null &&
      quote.high24h < quote.low24h
    ) {
      context.addIssue({
        code: "custom",
        path: ["high24h"],
        message: "24h high cannot be below 24h low",
      });
    }
  });

export const CandleSchema = z
  .object({
    assetId: z.string().min(1),
    provider: MarketDataProviderSchema.exclude(["snapshot"]),
    instrumentId: z.string().min(1),
    timeframe: z.enum(["1h", "1d"]),
    openTime: z.string().datetime({ offset: true }),
    closeTime: z.string().datetime({ offset: true }),
    fetchedAt: z.string().datetime({ offset: true }),
    isComplete: z.boolean(),
    open: NullablePositiveNumberSchema,
    high: NullablePositiveNumberSchema,
    low: NullablePositiveNumberSchema,
    close: NullablePositiveNumberSchema,
    volume: NullableNonNegativeNumberSchema,
    quoteVolume: NullableNonNegativeNumberSchema,
  })
  .strict()
  .superRefine((candle, context) => {
    if (
      candle.high != null &&
      candle.low != null &&
      candle.high < candle.low
    ) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "Candle high cannot be below candle low",
      });
    }

    const body = [candle.open, candle.close].filter(
      (value): value is number => value != null,
    );
    if (
      candle.high != null &&
      body.some((value) => value > candle.high!)
    ) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "Candle high must contain open and close",
      });
    }
    if (
      candle.low != null &&
      body.some((value) => value < candle.low!)
    ) {
      context.addIssue({
        code: "custom",
        path: ["low"],
        message: "Candle low must contain open and close",
      });
    }
  });

export const DataQualitySchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    generatedAt: z.string().datetime({ offset: true }),
    sources: z.array(MarketDataProviderSchema).min(1),
    fallbackAssets: z.array(z.string().min(1)),
    missingAssets: z.array(z.string().min(1)),
    coverageRatio: z.number().finite().min(0).max(1),
    isStale: z.boolean(),
    staleAfterSeconds: z.number().int().positive(),
    sourceAsOf: SourceAsOfSchema.optional(),
    staleSources: z.array(MarketDataProviderSchema).optional(),
  })
  .strict()
  .superRefine((quality, context) => {
    const generatedAtMs = Date.parse(quality.generatedAt);
    if (Date.parse(quality.asOf) > generatedAtMs) {
      context.addIssue({
        code: "custom",
        path: ["asOf"],
        message: "asOf cannot be later than generatedAt",
      });
    }

    for (const [source, sourceAsOf] of Object.entries(
      quality.sourceAsOf ?? {},
    )) {
      if (
        !quality.sources.includes(source as MarketDataProvider)
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceAsOf", source],
          message: "sourceAsOf can only contain declared sources",
        });
      }
      if (sourceAsOf && Date.parse(sourceAsOf) > generatedAtMs) {
        context.addIssue({
          code: "custom",
          path: ["sourceAsOf", source],
          message: "A source timestamp cannot be later than generatedAt",
        });
      }
    }

    const staleSources = quality.staleSources ?? [];
    if (staleSources.some((source) => !quality.sources.includes(source))) {
      context.addIssue({
        code: "custom",
        path: ["staleSources"],
        message: "staleSources must be a subset of sources",
      });
    }
    if (staleSources.length > 0 && !quality.isStale) {
      context.addIssue({
        code: "custom",
        path: ["isStale"],
        message: "isStale must be true when staleSources is not empty",
      });
    }
  });

export const ProviderIssueSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    item: z.union([z.string(), z.number().int()]).optional(),
  })
  .strict();

export function providerResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      provider: MarketDataProviderSchema.exclude(["snapshot"]),
      status: z.enum(["success", "partial", "failed"]),
      data: dataSchema,
      quality: DataQualitySchema,
      errors: z.array(ProviderIssueSchema),
    })
    .strict()
    .superRefine((result, context) => {
      const data = (result as { data: unknown }).data;
      const dataLength = Array.isArray(data) ? data.length : null;
      const coverage = result.quality.coverageRatio;

      if (result.status === "success") {
        if (result.errors.length > 0) {
          context.addIssue({
            code: "custom",
            path: ["errors"],
            message: "A successful provider result cannot contain errors",
          });
        }
        if (dataLength === 0 || coverage !== 1) {
          context.addIssue({
            code: "custom",
            path: ["status"],
            message: "A successful provider result must have data and full coverage",
          });
        }
      }

      if (result.status === "partial") {
        if (
          result.errors.length === 0 ||
          dataLength === 0 ||
          coverage <= 0 ||
          coverage >= 1
        ) {
          context.addIssue({
            code: "custom",
            path: ["status"],
            message:
              "A partial provider result must contain usable data, errors, and partial coverage",
          });
        }
      }

      if (result.status === "failed") {
        if (
          result.errors.length === 0 ||
          (dataLength != null && dataLength > 0) ||
          coverage !== 0
        ) {
          context.addIssue({
            code: "custom",
            path: ["status"],
            message:
              "A failed provider result must contain errors, no usable data, and zero coverage",
          });
        }
      }
    });
}

export const PeriodReferencePricesSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    current: NullablePositiveNumberSchema,
    price3d: NullablePositiveNumberSchema,
    price7d: NullablePositiveNumberSchema,
    price30d: NullablePositiveNumberSchema,
  })
  .strict();

export type MarketDataProvider = z.infer<typeof MarketDataProviderSchema>;
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;
export type Candle = z.infer<typeof CandleSchema>;
export type DataQuality = z.infer<typeof DataQualitySchema>;
export type ProviderIssue = z.infer<typeof ProviderIssueSchema>;
export type PeriodReferencePrices = z.infer<typeof PeriodReferencePricesSchema>;

export interface ProviderResult<T> {
  provider: Exclude<MarketDataProvider, "snapshot">;
  status: "success" | "partial" | "failed";
  data: T;
  quality: DataQuality;
  errors: ProviderIssue[];
}

export function createDataQuality({
  asOf,
  generatedAt = asOf,
  sources,
  fallbackAssets = [],
  missingAssets = [],
  coverageRatio,
  isStale = false,
  staleAfterSeconds,
  sourceAsOf = {},
  staleSources = [],
}: DataQuality): DataQuality {
  return DataQualitySchema.parse({
    asOf,
    generatedAt,
    sources: [...new Set(sources)],
    fallbackAssets: [...new Set(fallbackAssets)],
    missingAssets: [...new Set(missingAssets)],
    coverageRatio,
    isStale,
    staleAfterSeconds,
    sourceAsOf,
    staleSources: [...new Set(staleSources)],
  });
}
