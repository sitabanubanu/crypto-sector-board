import { z } from "zod";
import {
  DataQualitySchema,
  MarketDataProviderSchema,
  NullableNonNegativeNumberSchema,
  NullablePositiveNumberSchema,
} from "./contracts";
import { DailySnapshotSchema } from "./snapshot-schema";

export const PublicAssetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const PublicAssetSchema = z
  .object({
    assetId: PublicAssetIdSchema,
    symbol: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const DataBackendSchema = z.enum(["database", "json"]);

const DifferenceSummarySchema = z
  .object({
    sampleSize: z.number().int().nonnegative(),
    medianRelativeDifference: NullableNonNegativeNumberSchema,
    maxRelativeDifference: NullableNonNegativeNumberSchema,
  })
  .strict();

export const BoardComparisonSchema = z
  .object({
    referenceBackend: z.literal("json"),
    comparedAt: z.string().datetime({ offset: true }),
    databaseAssets: z.number().int().nonnegative(),
    jsonAssets: z.number().int().nonnegative(),
    commonAssets: z.number().int().nonnegative(),
    databaseOnlyAssets: z.array(PublicAssetIdSchema),
    jsonOnlyAssets: z.array(PublicAssetIdSchema),
    generatedAtDeltaSeconds: z.number().finite().nonnegative(),
    price: DifferenceSummarySchema,
    marketCap: DifferenceSummarySchema,
  })
  .strict();

export const BoardMetaSchema = z
  .object({
    ...DataQualitySchema.shape,
    backend: DataBackendSchema,
    dualRead: z.boolean(),
    comparison: BoardComparisonSchema.optional(),
  })
  .strict();

export const BoardResponseSchema = z
  .object({
    data: z
      .object({
        snapshot: DailySnapshotSchema,
        assets: z.array(PublicAssetSchema).min(1),
        focusAssets: z.array(PublicAssetIdSchema),
      })
      .strict(),
    meta: BoardMetaSchema,
  })
  .strict();

export const BoardQuerySchema = z
  .object({
    period: z.enum(["24h", "3d", "7d", "30d"]).default("24h"),
    weight: z.literal("market_cap").default("market_cap"),
  })
  .strict();

export const CandlePointSchema = z
  .object({
    openTime: z.string().datetime({ offset: true }),
    closeTime: z.string().datetime({ offset: true }),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volumeBase: NullableNonNegativeNumberSchema,
    volumeQuote: NullableNonNegativeNumberSchema,
    isComplete: z.boolean(),
  })
  .strict();

export const CandlesQuerySchema = z
  .object({
    assetId: PublicAssetIdSchema,
    timeframe: z.literal("1h").default("1h"),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(744),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.from == null) !== (query.to == null)) {
      context.addIssue({
        code: "custom",
        path: query.from == null ? ["from"] : ["to"],
        message: "from and to must be provided together",
      });
      return;
    }
    if (
      query.from != null &&
      query.to != null &&
      Date.parse(query.from) >= Date.parse(query.to)
    ) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "to must be later than from",
      });
    }
  });

export const PublicApiMetaSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    generatedAt: z.string().datetime({ offset: true }),
    sources: z.array(MarketDataProviderSchema),
    fallbackAssets: z.array(PublicAssetIdSchema),
    missingAssets: z.array(PublicAssetIdSchema),
    coverageRatio: z.number().finite().min(0).max(1),
    isStale: z.boolean(),
    staleAfterSeconds: z.number().int().positive(),
  })
  .strict();

export const CandlesResponseSchema = z
  .object({
    data: z
      .object({
        assetId: PublicAssetIdSchema,
        timeframe: z.literal("1h"),
        provider: MarketDataProviderSchema.exclude([
          "coingecko",
          "snapshot",
        ]).nullable(),
        candles: z.array(CandlePointSchema),
      })
      .strict(),
    meta: PublicApiMetaSchema,
  })
  .strict();

export const HistoryQuerySchema = z
  .object({
    assetIds: z.string().min(1),
    days: z.coerce.number().int().min(2).max(31).default(31),
  })
  .strict();

export const HistoryPointSchema = z
  .object({
    time: z.string().datetime({ offset: true }),
    close: NullablePositiveNumberSchema,
  })
  .strict();

export const AssetHistorySchema = z
  .object({
    assetId: PublicAssetIdSchema,
    provider: MarketDataProviderSchema.exclude([
      "coingecko",
      "snapshot",
    ]).nullable(),
    coverageRatio: z.number().finite().min(0).max(1),
    points: z.array(HistoryPointSchema),
  })
  .strict();

export const HistoryResponseSchema = z
  .object({
    data: z
      .object({
        timeframe: z.literal("1d"),
        days: z.number().int().min(2).max(31),
        assets: z.array(AssetHistorySchema),
      })
      .strict(),
    meta: PublicApiMetaSchema,
  })
  .strict();

export const PublicApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type PublicAsset = z.infer<typeof PublicAssetSchema>;
export type DataBackend = z.infer<typeof DataBackendSchema>;
export type BoardComparison = z.infer<typeof BoardComparisonSchema>;
export type BoardResponse = z.infer<typeof BoardResponseSchema>;
export type CandlesQuery = z.infer<typeof CandlesQuerySchema>;
export type CandlesResponse = z.infer<typeof CandlesResponseSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
