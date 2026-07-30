import type { CoinMarketItem } from "./coingecko";
import type { PeriodType } from "./types";

export const MIN_SECTOR_COVERAGE_RATIO = 0.8;

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

export function percentToRatio(value: number | null | undefined): number | null {
  const finite = finiteOrNull(value);
  return finite == null ? null : finite / 100;
}

export function calcReturn(
  current: number | null | undefined,
  reference: number | null | undefined,
): number | null {
  const currentValue = finiteOrNull(current);
  const referenceValue = finiteOrNull(reference);
  if (
    currentValue == null ||
    referenceValue == null ||
    currentValue <= 0 ||
    referenceValue <= 0
  ) {
    return null;
  }
  return currentValue / referenceValue - 1;
}

export function calcAmplitude(
  high: number | null | undefined,
  low: number | null | undefined,
): number | null {
  const highValue = finiteOrNull(high);
  const lowValue = finiteOrNull(low);
  if (
    highValue == null ||
    lowValue == null ||
    highValue <= 0 ||
    lowValue <= 0 ||
    highValue < lowValue
  ) {
    return null;
  }
  return highValue / lowValue - 1;
}

export function calcLogReturnVolatility(
  closes: ReadonlyArray<number | null | undefined>,
): number | null {
  if (
    closes.length < 3 ||
    closes.some((value) => value == null || !Number.isFinite(value) || value <= 0)
  ) {
    return null;
  }

  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    returns.push(Math.log(closes[index - 1]! / closes[index]!));
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    returns.length;
  return Math.sqrt(variance);
}

export function calcLookbackReturn(
  current: number | null | undefined,
  closesMostRecentFirst: ReadonlyArray<number | null | undefined> | undefined,
  days: number,
): number | null {
  if (!closesMostRecentFirst || days < 1 || closesMostRecentFirst.length <= days) {
    return null;
  }
  return calcReturn(current, closesMostRecentFirst[days]);
}

export function calcCoinMetricsFromMarket(coin: CoinMarketItem) {
  const high = finiteOrNull(coin.high_24h);
  const low = finiteOrNull(coin.low_24h);
  const close = finiteOrNull(coin.current_price);

  return {
    open: null,
    high,
    low,
    close,
    returnPct: percentToRatio(coin.price_change_percentage_24h),
    amplitude: calcAmplitude(high, low),
    volatility: null,
    returnPct3d: null,
    returnPct7d: percentToRatio(coin.price_change_percentage_7d_in_currency),
    returnPct30d: percentToRatio(coin.price_change_percentage_30d_in_currency),
    volume24h: finiteOrNull(coin.total_volume),
  };
}

interface WeightedCoinMetrics {
  returnPct: number | null;
  amplitude: number | null;
  volatility: number | null;
  returnPct3d?: number | null;
  returnPct7d?: number | null;
  returnPct30d?: number | null;
  marketCap: number | null;
  isMainstream: boolean;
}

interface WeightedMetric {
  value: number | null;
  coverageRatio: number;
}

function weightedMetric(
  coins: WeightedCoinMetrics[],
  totalWeight: number,
  weightCoverageRatio: number,
  select: (coin: WeightedCoinMetrics) => number | null | undefined,
): WeightedMetric {
  if (totalWeight <= 0) {
    return { value: null, coverageRatio: 0 };
  }

  const valid = coins.filter((coin) => {
    const value = select(coin);
    return (
      coin.marketCap != null &&
      coin.marketCap > 0 &&
      value != null &&
      Number.isFinite(value)
    );
  });
  const coveredWeight = valid.reduce((sum, coin) => sum + coin.marketCap!, 0);
  const coverageRatio = (coveredWeight / totalWeight) * weightCoverageRatio;

  if (coveredWeight <= 0 || coverageRatio < MIN_SECTOR_COVERAGE_RATIO) {
    return { value: null, coverageRatio };
  }

  return {
    value:
      valid.reduce(
        (sum, coin) => sum + select(coin)! * coin.marketCap!,
        0,
      ) / coveredWeight,
    coverageRatio,
  };
}

export function calcWeightedSectorMetrics(coins: WeightedCoinMetrics[]) {
  const expectedMainstream = coins.filter((coin) => coin.isMainstream);
  const mainstream = expectedMainstream.filter(
    (coin) => coin.isMainstream && coin.marketCap != null && coin.marketCap > 0,
  );
  const totalWeight = mainstream.reduce((sum, coin) => sum + coin.marketCap!, 0);
  const weightCoverageRatio =
    expectedMainstream.length > 0
      ? mainstream.length / expectedMainstream.length
      : 0;

  const return24h = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.returnPct,
  );
  const amplitude = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.amplitude,
  );
  const volatility = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.volatility,
  );
  const return3d = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.returnPct3d,
  );
  const return7d = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.returnPct7d,
  );
  const return30d = weightedMetric(
    mainstream,
    totalWeight,
    weightCoverageRatio,
    (coin) => coin.returnPct30d,
  );

  const coverageByPeriod: Partial<Record<PeriodType, number>> = {
    "24h": return24h.coverageRatio,
    "3d": return3d.coverageRatio,
    "7d": return7d.coverageRatio,
    "30d": return30d.coverageRatio,
  };

  return {
    weightedReturnPct: return24h.value,
    weightedAmplitude: amplitude.value,
    weightedVolatility: volatility.value,
    weightedReturnPct3d: return3d.value,
    weightedReturnPct7d: return7d.value,
    weightedReturnPct30d: return30d.value,
    coverageRatio: return24h.coverageRatio,
    coverageByPeriod,
    weightCoverageRatio,
  };
}
