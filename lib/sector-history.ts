import { MIN_SECTOR_COVERAGE_RATIO } from "./metrics";
import type { SectorSnapshot } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface TimedClosePoint {
  time: string;
  close: number | null;
}

export type AssetHistoryMap = ReadonlyMap<
  string,
  ReadonlyArray<TimedClosePoint>
>;

export interface SectorReturnPoint {
  date: string;
  value: number;
  coverageRatio: number;
  sampleSize: number;
}

function finitePositive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function utcSessionDay(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  // History points carry the close timestamp. A completed UTC session closes
  // exactly at the next day's 00:00, so move one millisecond inside the
  // session before deriving its calendar label.
  return new Date(timestamp - 1).toISOString().slice(0, 10);
}

function previousUtcDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function buildAssetDailyReturns(
  points: ReadonlyArray<TimedClosePoint>,
): Map<string, number> {
  const closeByDay = new Map<string, number>();
  const sorted = [...points].sort(
    (left, right) => Date.parse(left.time) - Date.parse(right.time),
  );

  for (const point of sorted) {
    const day = utcSessionDay(point.time);
    if (!day || !finitePositive(point.close)) continue;
    closeByDay.set(day, point.close);
  }

  const returns = new Map<string, number>();
  for (const [day, close] of closeByDay) {
    const reference = closeByDay.get(previousUtcDay(day));
    if (!finitePositive(reference)) continue;
    const value = close / reference - 1;
    if (Number.isFinite(value)) returns.set(day, value);
  }
  return returns;
}

export function buildSectorReturnSeries(
  sector: SectorSnapshot,
  historyByAssetId: AssetHistoryMap,
  minimumCoverageRatio = MIN_SECTOR_COVERAGE_RATIO,
): SectorReturnPoint[] {
  const weightedCoins = sector.coins.filter(
    (coin) =>
      coin.isMainstream &&
      finitePositive(coin.marketCap),
  );
  const totalWeight = weightedCoins.reduce(
    (sum, coin) => sum + coin.marketCap!,
    0,
  );
  if (totalWeight <= 0) return [];

  const returnsByAsset = new Map<string, Map<string, number>>();
  const dates = new Set<string>();
  for (const coin of weightedCoins) {
    const returns = buildAssetDailyReturns(
      historyByAssetId.get(coin.id) ?? [],
    );
    returnsByAsset.set(coin.id, returns);
    for (const date of returns.keys()) dates.add(date);
  }

  return [...dates]
    .sort()
    .flatMap((date) => {
      const available = weightedCoins.flatMap((coin) => {
        const value = returnsByAsset.get(coin.id)?.get(date);
        return value == null || !Number.isFinite(value)
          ? []
          : [{ value, weight: coin.marketCap! }];
      });
      const coveredWeight = available.reduce(
        (sum, item) => sum + item.weight,
        0,
      );
      const coverageRatio = coveredWeight / totalWeight;
      if (
        coveredWeight <= 0 ||
        coverageRatio < minimumCoverageRatio
      ) {
        return [];
      }

      const value =
        available.reduce(
          (sum, item) => sum + item.value * item.weight,
          0,
        ) / coveredWeight;
      return Number.isFinite(value)
        ? [{ date, value, coverageRatio, sampleSize: available.length }]
        : [];
    });
}

export function innerJoinSectorReturns(
  left: ReadonlyArray<SectorReturnPoint>,
  right: ReadonlyArray<SectorReturnPoint>,
): Array<{ date: string; left: number; right: number }> {
  const rightByDate = new Map(
    right.map((point) => [point.date, point.value]),
  );
  return left.flatMap((point) => {
    const rightValue = rightByDate.get(point.date);
    return rightValue == null
      ? []
      : [{ date: point.date, left: point.value, right: rightValue }];
  });
}
