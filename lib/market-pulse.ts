import { MIN_SECTOR_COVERAGE_RATIO } from "./metrics";
import {
  buildSectorReturnSeries,
  type AssetHistoryMap,
  type SectorReturnPoint,
} from "./sector-history";
import type { CoinSnapshot, DailySnapshot, SectorSnapshot } from "./types";

export const MIN_ANOMALY_SAMPLE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type PulseQuality = "ok" | "insufficient_data";

export interface SectorContribution {
  assetId: string;
  symbol: string;
  name: string;
  contribution: number;
  absoluteShare: number;
}

export interface SectorPulse {
  sectorId: string;
  sectorName: string;
  currentReturn: number | null;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  previousRankDate: string | null;
  breadthRatio: number | null;
  breadthSampleSize: number;
  coinCoverageRatio: number;
  medianReturn: number | null;
  topContributors: SectorContribution[];
  top3ConcentrationRatio: number | null;
  anomalyZScore: number | null;
  historySampleSize: number;
  currentCoverageRatio: number;
  quality: PulseQuality;
  asOf: string;
}

export interface MarketPulse {
  sectors: SectorPulse[];
  marketBreadthRatio: number | null;
  marketBreadthSampleSize: number;
  previousRankDate: string | null;
  asOf: string;
  quality: PulseQuality;
}

export interface MarketSearchResult {
  kind: "asset" | "sector";
  id: string;
  label: string;
  secondaryLabel: string;
  sectorIds: string[];
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function zScore(
  current: number | null,
  historical: number[],
): number | null {
  if (
    current == null ||
    historical.length < MIN_ANOMALY_SAMPLE_SIZE
  ) {
    return null;
  }
  const mean =
    historical.reduce((sum, value) => sum + value, 0) /
    historical.length;
  const variance =
    historical.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    historical.length;
  if (!Number.isFinite(variance) || variance <= 0) return null;
  const score = (current - mean) / Math.sqrt(variance);
  return Number.isFinite(score) ? score : null;
}

function currentCoverage(sector: SectorSnapshot): number {
  return sector.coverageByPeriod?.["24h"] ?? sector.coverageRatio ?? 0;
}

function previousCompleteUtcDay(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const dayStart = new Date(timestamp);
  dayStart.setUTCHours(0, 0, 0, 0);
  return new Date(dayStart.getTime() - DAY_MS).toISOString().slice(0, 10);
}

function rankSectors(
  values: Array<{ sectorId: string; value: number }>,
): Map<string, number> {
  return new Map(
    [...values]
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.sectorId.localeCompare(right.sectorId),
      )
      .map((item, index) => [item.sectorId, index + 1]),
  );
}

function contributions(sector: SectorSnapshot): {
  topContributors: SectorContribution[];
  top3ConcentrationRatio: number | null;
} {
  const eligible = sector.coins.filter(
    (coin) =>
      coin.isMainstream &&
      finite(coin.marketCap) &&
      coin.marketCap > 0 &&
      finite(coin.returnPct),
  );
  const coveredMarketCap = eligible.reduce(
    (sum, coin) => sum + coin.marketCap!,
    0,
  );
  if (coveredMarketCap <= 0) {
    return { topContributors: [], top3ConcentrationRatio: null };
  }

  const raw = eligible.map((coin) => ({
    assetId: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    contribution: (coin.returnPct! * coin.marketCap!) / coveredMarketCap,
  }));
  const totalAbsoluteContribution = raw.reduce(
    (sum, item) => sum + Math.abs(item.contribution),
    0,
  );
  const ranked = raw
    .sort(
      (left, right) =>
        Math.abs(right.contribution) - Math.abs(left.contribution) ||
        left.assetId.localeCompare(right.assetId),
    )
    .map((item) => ({
      ...item,
      absoluteShare:
        totalAbsoluteContribution > 0
          ? Math.abs(item.contribution) / totalAbsoluteContribution
          : 0,
    }));

  return {
    topContributors: ranked.slice(0, 3),
    top3ConcentrationRatio:
      totalAbsoluteContribution > 0
        ? ranked
            .slice(0, 3)
            .reduce((sum, item) => sum + item.absoluteShare, 0)
        : null,
  };
}

function latestComparableRankDate(
  seriesBySector: Map<string, SectorReturnPoint[]>,
  currentRankedSectorCount: number,
): string | null {
  if (currentRankedSectorCount === 0) return null;
  const counts = new Map<string, number>();
  for (const series of seriesBySector.values()) {
    for (const point of series) {
      counts.set(point.date, (counts.get(point.date) ?? 0) + 1);
    }
  }
  const required = Math.max(3, Math.ceil(currentRankedSectorCount * 0.8));
  return (
    [...counts.entries()]
      .filter(([, count]) => count >= required)
      .map(([date]) => date)
      .sort()
      .at(-1) ?? null
  );
}

function uniqueCoins(sectors: SectorSnapshot[]): CoinSnapshot[] {
  const coins = new Map<string, CoinSnapshot>();
  for (const sector of sectors) {
    for (const coin of sector.coins) coins.set(coin.id, coin);
  }
  return [...coins.values()];
}

export function buildMarketPulse(
  snapshot: DailySnapshot,
  historyByAssetId: AssetHistoryMap,
): MarketPulse {
  const asOf = snapshot.dataQuality?.asOf ?? snapshot.generatedAt;
  const expectedHistoryDate = previousCompleteUtcDay(asOf);
  const snapshotQualityOk =
    snapshot.dataQuality?.isStale !== true &&
    (snapshot.dataQuality?.coverageRatio ?? 1) >= MIN_SECTOR_COVERAGE_RATIO;
  const seriesBySector = new Map(
    snapshot.sectors.map((sector) => [
      sector.id,
      buildSectorReturnSeries(sector, historyByAssetId),
    ]),
  );
  const currentRank = rankSectors(
    snapshot.sectors.flatMap((sector) => {
      const coverage = currentCoverage(sector);
      return finite(sector.weightedReturnPct) &&
        coverage >= MIN_SECTOR_COVERAGE_RATIO
        ? [{ sectorId: sector.id, value: sector.weightedReturnPct }]
        : [];
    }),
  );
  const previousRankDate = latestComparableRankDate(
    seriesBySector,
    currentRank.size,
  );
  const previousRank = rankSectors(
    previousRankDate
      ? snapshot.sectors.flatMap((sector) => {
          const value = seriesBySector
            .get(sector.id)
            ?.find((point) => point.date === previousRankDate)?.value;
          return value == null
            ? []
            : [{ sectorId: sector.id, value }];
        })
      : [],
  );

  const pulses = snapshot.sectors.map((sector) => {
    const validReturns = sector.coins.flatMap((coin) =>
      finite(coin.returnPct) ? [coin.returnPct] : [],
    );
    const breadthSampleSize = validReturns.length;
    const coinCoverageRatio =
      sector.coins.length > 0
        ? breadthSampleSize / sector.coins.length
        : 0;
    const series = seriesBySector.get(sector.id) ?? [];
    const currentReturn = finite(sector.weightedReturnPct)
      ? sector.weightedReturnPct
      : null;
    const rankedNow = currentRank.get(sector.id) ?? null;
    const rankedBefore = previousRank.get(sector.id) ?? null;
    const coverage = currentCoverage(sector);
    const historyIsCurrent =
      expectedHistoryDate != null &&
      series.at(-1)?.date === expectedHistoryDate;
    const quality: PulseQuality =
      snapshotQualityOk &&
      currentReturn != null &&
      coverage >= MIN_SECTOR_COVERAGE_RATIO &&
      coinCoverageRatio >= MIN_SECTOR_COVERAGE_RATIO &&
      historyIsCurrent
        ? "ok"
        : "insufficient_data";
    const contributionSummary = contributions(sector);

    return {
      sectorId: sector.id,
      sectorName: sector.name,
      currentReturn,
      currentRank: rankedNow,
      previousRank: rankedBefore,
      rankChange:
        rankedNow != null && rankedBefore != null
          ? rankedBefore - rankedNow
          : null,
      previousRankDate,
      breadthRatio:
        breadthSampleSize > 0
          ? validReturns.filter((value) => value > 0).length /
            breadthSampleSize
          : null,
      breadthSampleSize,
      coinCoverageRatio,
      medianReturn: median(validReturns),
      ...contributionSummary,
      anomalyZScore: zScore(
        currentReturn,
        series.map((point) => point.value),
      ),
      historySampleSize: series.length,
      currentCoverageRatio: coverage,
      quality,
      asOf,
    } satisfies SectorPulse;
  });

  const marketCoins = uniqueCoins(snapshot.sectors);
  const validMarketReturns = marketCoins.flatMap((coin) =>
    finite(coin.returnPct) ? [coin.returnPct] : [],
  );

  return {
    sectors: pulses,
    marketBreadthRatio:
      validMarketReturns.length > 0
        ? validMarketReturns.filter((value) => value > 0).length /
          validMarketReturns.length
        : null,
    marketBreadthSampleSize: validMarketReturns.length,
    previousRankDate,
    asOf,
    quality: snapshotQualityOk ? "ok" : "insufficient_data",
  };
}

export function searchMarket(
  snapshot: DailySnapshot,
  query: string,
): MarketSearchResult[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return [];

  const results: MarketSearchResult[] = [];
  for (const sector of snapshot.sectors) {
    if (
      sector.id.toLocaleLowerCase().includes(normalized) ||
      sector.name.toLocaleLowerCase("zh-CN").includes(normalized)
    ) {
      results.push({
        kind: "sector",
        id: sector.id,
        label: sector.name,
        secondaryLabel: `${sector.coins.length} 个资产`,
        sectorIds: [sector.id],
      });
    }
  }

  const assets = new Map<
    string,
    { coin: CoinSnapshot; sectorIds: Set<string> }
  >();
  for (const sector of snapshot.sectors) {
    for (const coin of sector.coins) {
      const current = assets.get(coin.id) ?? {
        coin,
        sectorIds: new Set<string>(),
      };
      current.sectorIds.add(sector.id);
      assets.set(coin.id, current);
    }
  }
  for (const { coin, sectorIds } of assets.values()) {
    if (
      coin.id.toLocaleLowerCase().includes(normalized) ||
      coin.symbol.toLocaleLowerCase().includes(normalized) ||
      coin.name.toLocaleLowerCase("zh-CN").includes(normalized)
    ) {
      results.push({
        kind: "asset",
        id: coin.id,
        label: coin.symbol,
        secondaryLabel: coin.name,
        sectorIds: [...sectorIds],
      });
    }
  }

  return results.sort((left, right) => {
    const leftExact =
      left.id.toLocaleLowerCase() === normalized ||
      left.label.toLocaleLowerCase() === normalized;
    const rightExact =
      right.id.toLocaleLowerCase() === normalized ||
      right.label.toLocaleLowerCase() === normalized;
    if (leftExact !== rightExact) return leftExact ? -1 : 1;
    if (left.kind !== right.kind) return left.kind === "asset" ? -1 : 1;
    return left.label.localeCompare(right.label, "zh-CN");
  });
}
