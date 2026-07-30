import { z } from "zod";
import {
  DataQualitySchema,
  MarketDataProviderSchema,
  NullableFiniteNumberSchema,
  NullableNonNegativeNumberSchema,
  NullablePositiveNumberSchema,
} from "./contracts";
import type { DailySnapshot } from "../types";

const CoinFallbackFieldSchema = z.enum(["marketCap", "isMainstream"]);

export const CoinSnapshotSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    name: z.string().min(1),
    marketCap: NullableNonNegativeNumberSchema,
    open: NullablePositiveNumberSchema,
    high: NullablePositiveNumberSchema,
    low: NullablePositiveNumberSchema,
    close: NullablePositiveNumberSchema,
    returnPct: NullableFiniteNumberSchema,
    amplitude: NullableNonNegativeNumberSchema,
    volatility: NullableNonNegativeNumberSchema,
    returnPct3d: NullableFiniteNumberSchema.optional(),
    returnPct7d: NullableFiniteNumberSchema.optional(),
    returnPct30d: NullableFiniteNumberSchema.optional(),
    volume24h: NullableNonNegativeNumberSchema.optional(),
    isMainstream: z.boolean(),
    source: MarketDataProviderSchema.optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
    fallbackUsed: z.boolean().optional(),
    fallbackFields: z.array(CoinFallbackFieldSchema).optional(),
  })
  .strict()
  .superRefine((coin, context) => {
    if (coin.high != null && coin.low != null && coin.high < coin.low) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "Coin high cannot be below coin low",
      });
    }
    if (
      coin.fallbackFields &&
      coin.fallbackFields.length > 0 &&
      coin.fallbackUsed !== true
    ) {
      context.addIssue({
        code: "custom",
        path: ["fallbackUsed"],
        message: "fallbackUsed must be true when fallbackFields is not empty",
      });
    }
  });

const CoverageByPeriodSchema = z
  .object({
    "24h": z.number().finite().min(0).max(1).optional(),
    "3d": z.number().finite().min(0).max(1).optional(),
    "7d": z.number().finite().min(0).max(1).optional(),
    "30d": z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export const SectorSnapshotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    totalMarketCap: NullableNonNegativeNumberSchema,
    totalVolume24h: NullableNonNegativeNumberSchema.optional(),
    weightedReturnPct: NullableFiniteNumberSchema,
    weightedAmplitude: NullableNonNegativeNumberSchema,
    weightedVolatility: NullableNonNegativeNumberSchema,
    weightedReturnPct3d: NullableFiniteNumberSchema.optional(),
    weightedReturnPct7d: NullableFiniteNumberSchema.optional(),
    weightedReturnPct30d: NullableFiniteNumberSchema.optional(),
    coverageRatio: z.number().finite().min(0).max(1).optional(),
    coverageByPeriod: CoverageByPeriodSchema.optional(),
    weightCoverageRatio: z.number().finite().min(0).max(1).optional(),
    coins: z.array(CoinSnapshotSchema),
  })
  .strict();

export const DailySnapshotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2})?$/),
    generatedAt: z.string().datetime({ offset: true }),
    source: MarketDataProviderSchema,
    dataQuality: DataQualitySchema.optional(),
    sectors: z.array(SectorSnapshotSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const sectorIds = new Set<string>();
    snapshot.sectors.forEach((sector, sectorIndex) => {
      if (sectorIds.has(sector.id)) {
        context.addIssue({
          code: "custom",
          path: ["sectors", sectorIndex, "id"],
          message: "Sector IDs must be unique",
        });
      }
      sectorIds.add(sector.id);

      const coinIds = new Set<string>();
      sector.coins.forEach((coin, coinIndex) => {
        if (coinIds.has(coin.id)) {
          context.addIssue({
            code: "custom",
            path: ["sectors", sectorIndex, "coins", coinIndex, "id"],
            message: "Coin IDs must be unique within a sector",
          });
        }
        coinIds.add(coin.id);
      });
    });
  });

export function parseDailySnapshot(input: unknown): DailySnapshot {
  return DailySnapshotSchema.parse(input) as DailySnapshot;
}
