import {
  buildSectorReturnSeries,
  innerJoinSectorReturns,
  type AssetHistoryMap,
  type SectorReturnPoint,
} from "./sector-history";
import type { SectorSnapshot } from "./types";

export const MIN_CORRELATION_SAMPLE_SIZE = 30;

function pearson(
  pairs: ReadonlyArray<{ left: number; right: number }>,
): number | null {
  const n = pairs.length;
  if (n === 0) return null;

  let sumLeft = 0;
  let sumRight = 0;
  let sumProduct = 0;
  let sumLeftSquared = 0;
  let sumRightSquared = 0;
  for (const pair of pairs) {
    sumLeft += pair.left;
    sumRight += pair.right;
    sumProduct += pair.left * pair.right;
    sumLeftSquared += pair.left * pair.left;
    sumRightSquared += pair.right * pair.right;
  }

  const numerator = n * sumProduct - sumLeft * sumRight;
  const denominator = Math.sqrt(
    (n * sumLeftSquared - sumLeft * sumLeft) *
      (n * sumRightSquared - sumRight * sumRight),
  );
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : null;
}

export interface CorrelationMatrix {
  sectorIds: string[];
  sectorNames: string[];
  matrix: Array<Array<number | null>>;
  sampleCounts: number[][];
  minimumSampleSize: number;
  asOf: string | null;
  weighting: "current_market_cap";
}

export function buildCorrelationMatrix(
  sectors: ReadonlyArray<SectorSnapshot>,
  historyByAssetId: AssetHistoryMap,
  minimumSampleSize = MIN_CORRELATION_SAMPLE_SIZE,
): CorrelationMatrix | null {
  const series = sectors
    .map((sector) => ({
      id: sector.id,
      name: sector.name,
      returns: buildSectorReturnSeries(sector, historyByAssetId),
    }))
    .filter((sector) => sector.returns.length > 0);
  if (series.length < 2) return null;

  const matrix: Array<Array<number | null>> = [];
  const sampleCounts: number[][] = [];
  for (let rowIndex = 0; rowIndex < series.length; rowIndex += 1) {
    matrix[rowIndex] = [];
    sampleCounts[rowIndex] = [];
    for (
      let columnIndex = 0;
      columnIndex < series.length;
      columnIndex += 1
    ) {
      if (columnIndex < rowIndex) {
        matrix[rowIndex][columnIndex] = matrix[columnIndex][rowIndex];
        sampleCounts[rowIndex][columnIndex] =
          sampleCounts[columnIndex][rowIndex];
        continue;
      }
      if (rowIndex === columnIndex) {
        const count = series[rowIndex].returns.length;
        sampleCounts[rowIndex][columnIndex] = count;
        matrix[rowIndex][columnIndex] =
          count >= minimumSampleSize ? 1 : null;
        continue;
      }

      const joined = innerJoinSectorReturns(
        series[rowIndex].returns,
        series[columnIndex].returns,
      );
      sampleCounts[rowIndex][columnIndex] = joined.length;
      matrix[rowIndex][columnIndex] =
        joined.length >= minimumSampleSize
          ? pearson(joined)
          : null;
    }
  }

  const dates = series.flatMap((sector) =>
    sector.returns.map((point: SectorReturnPoint) => point.date),
  );

  return {
    sectorIds: series.map((sector) => sector.id),
    sectorNames: series.map((sector) => sector.name),
    matrix,
    sampleCounts,
    minimumSampleSize,
    asOf: dates.sort().at(-1) ?? null,
    weighting: "current_market_cap",
  };
}
