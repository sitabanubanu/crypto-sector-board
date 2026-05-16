import type { SectorSnapshot, CoinSnapshot, PeriodType } from "./types";

export function getSectorReturn(sector: SectorSnapshot, period: PeriodType): number {
  if (period === "7d") return sector.weightedReturnPct7d ?? 0;
  if (period === "30d") return sector.weightedReturnPct30d ?? 0;
  return sector.weightedReturnPct;
}

export function getCoinReturn(coin: CoinSnapshot, period: PeriodType): number {
  if (period === "7d") return coin.returnPct7d ?? 0;
  if (period === "30d") return coin.returnPct30d ?? 0;
  return coin.returnPct;
}

export function hasSectorReturnForPeriod(sector: SectorSnapshot, period: PeriodType): boolean {
  if (period === "7d") return sector.weightedReturnPct7d != null;
  if (period === "30d") return sector.weightedReturnPct30d != null;
  return true;
}

export function returnPctToColor(pct: number): string {
  if (pct >= 0.08) return "#c81e1e";
  if (pct >= 0.04) return "#e53e3e";
  if (pct >= 0.01) return "#fc8181";
  if (pct >= 0) return "#fed7d7";
  if (pct >= -0.01) return "#c6f6d5";
  if (pct >= -0.04) return "#68d391";
  if (pct >= -0.08) return "#38a169";
  return "#22543d";
}

export function textColorOnBlock(pct: number): string {
  return Math.abs(pct) >= 0.01 ? "#ffffff" : "#1f2328";
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

export function hasCoinReturnForPeriod(coin: CoinSnapshot, period: PeriodType): boolean {
  if (period === "7d") return coin.returnPct7d != null;
  if (period === "30d") return coin.returnPct30d != null;
  return true;
}

const GRAY = "#d1d5db";
const GRAY_TEXT = "#1f2328";

export function sectorColorForPeriod(sector: SectorSnapshot, period: PeriodType): string {
  if (!hasSectorReturnForPeriod(sector, period)) return GRAY;
  return returnPctToColor(getSectorReturn(sector, period));
}

export function coinColorForPeriod(coin: CoinSnapshot, period: PeriodType): string {
  if (!hasCoinReturnForPeriod(coin, period)) return GRAY;
  return returnPctToColor(getCoinReturn(coin, period));
}

export function sectorTextColorForPeriod(sector: SectorSnapshot, period: PeriodType): string {
  if (!hasSectorReturnForPeriod(sector, period)) return GRAY_TEXT;
  return textColorOnBlock(getSectorReturn(sector, period));
}

export function coinTextColorForPeriod(coin: CoinSnapshot, period: PeriodType): string {
  if (!hasCoinReturnForPeriod(coin, period)) return GRAY_TEXT;
  return textColorOnBlock(getCoinReturn(coin, period));
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}
