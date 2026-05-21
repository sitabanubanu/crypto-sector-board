import type { SectorSnapshot, SectorConfig } from "./types";
import { CG_TO_GATE } from "./gate";

// Daily return series for one sector (most recent first)
function sectorDailyReturns(
  sector: SectorConfig,
  klines: Map<string, number[]>,
): number[] | null {
  const series: number[][] = [];
  for (const coinId of sector.coins) {
    const gateId = CG_TO_GATE[coinId];
    if (!gateId) continue;
    const closes = klines.get(gateId);
    if (!closes || closes.length < 5) continue;
    // Convert closes to daily returns (most recent at index 0)
    const returns: number[] = [];
    for (let i = 0; i < closes.length - 1; i++) {
      if (closes[i + 1] > 0) {
        returns.push((closes[i] - closes[i + 1]) / closes[i + 1]);
      }
    }
    series.push(returns);
  }
  if (series.length === 0) return null;

  // Simple average across coins in the sector (aligned to same length)
  const minLen = Math.min(...series.map((s) => s.length));
  const avg: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let sum = 0;
    for (const s of series) sum += s[i];
    avg.push(sum / series.length);
  }
  return avg;
}

// Pearson correlation coefficient
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;

  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  return den === 0 ? 0 : num / den;
}

export interface CorrelationMatrix {
  sectorIds: string[];
  sectorNames: string[];
  matrix: number[][]; // matrix[i][j] = corr(sector i, sector j)
}

export function buildCorrelationMatrix(
  sectorsConfig: SectorConfig[],
  klines: Map<string, number[]>,
): CorrelationMatrix | null {
  // Compute daily return series for each sector
  const returnSeries: { id: string; name: string; returns: number[] }[] = [];
  for (const sc of sectorsConfig) {
    const r = sectorDailyReturns(sc, klines);
    if (r && r.length >= 5) {
      returnSeries.push({ id: sc.id, name: sc.name, returns: r });
    }
  }

  if (returnSeries.length < 3) return null;

  const n = returnSeries.length;
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (j < i) {
        matrix[i][j] = matrix[j][i];
      } else {
        matrix[i][j] = pearson(returnSeries[i].returns, returnSeries[j].returns);
      }
    }
  }

  return {
    sectorIds: returnSeries.map((s) => s.id),
    sectorNames: returnSeries.map((s) => s.name),
    matrix,
  };
}
