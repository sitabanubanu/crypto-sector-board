export type PeriodType = "24h" | "7d" | "30d";
export type DataSource = "snapshot" | "okx";

export interface CoinSnapshot {
  id: string;
  symbol: string;
  name: string;
  marketCap: number;
  open: number;
  high: number;
  low: number;
  close: number;
  returnPct: number;
  amplitude: number;
  volatility: number;
  returnPct7d?: number;
  returnPct30d?: number;
  isMainstream: boolean;
}

export interface SectorSnapshot {
  id: string;
  name: string;
  totalMarketCap: number;
  weightedReturnPct: number;
  weightedAmplitude: number;
  weightedVolatility: number;
  weightedReturnPct7d?: number;
  weightedReturnPct30d?: number;
  coins: CoinSnapshot[];
}

export interface DailySnapshot {
  date: string;
  generatedAt: string;
  source: string;
  sectors: SectorSnapshot[];
}

export interface SectorConfig {
  id: string;
  name: string;
  coins: string[];
}

export interface SectorsFile {
  version: number;
  lastUpdated: string;
  mainStreamThreshold: number;
  sectors: SectorConfig[];
}

export interface CustomSectorConfig {
  id: string;
  name: string;
  coins: string[]; // OKX instId, e.g. ["BTC-USDT", "ETH-USDT"]
}

export interface WatchlistConfig {
  sectors: Record<string, { enabled: boolean }>;
  customSectors?: CustomSectorConfig[];
}

export interface OkxTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
}
