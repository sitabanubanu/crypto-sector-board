import { calcWeightedSectorMetrics } from "@/lib/metrics";
import type {
  CustomSectorConfig,
  DailySnapshot,
  SectorSnapshot,
} from "@/lib/types";

function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return known.length > 0
    ? known.reduce((sum, value) => sum + value, 0)
    : null;
}

export function buildCustomSectorSnapshots(
  configs: CustomSectorConfig[],
  snapshot: DailySnapshot,
): SectorSnapshot[] {
  const coinsByAsset = new Map(
    snapshot.sectors.flatMap((sector) =>
      sector.coins.map((coin) => [coin.id, coin] as const),
    ),
  );

  return configs.flatMap((config) => {
    const coins = [
      ...new Set(config.coins),
    ].flatMap((assetId) => {
      const coin = coinsByAsset.get(assetId);
      return coin ? [{ ...coin }] : [];
    });
    if (coins.length === 0) return [];

    return [
      {
        id: config.id,
        name: config.name,
        totalMarketCap: sumKnown(coins.map((coin) => coin.marketCap)),
        totalVolume24h: sumKnown(coins.map((coin) => coin.volume24h)),
        ...calcWeightedSectorMetrics(coins),
        coins,
      },
    ];
  });
}
