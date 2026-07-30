export type PeriodType = "24h" | "3d" | "7d" | "30d";
export type DataSource = "snapshot" | "gate" | "okx" | "coingecko";
export type CoinFallbackField = "marketCap" | "isMainstream";

import type { DataQuality, MarketDataProvider } from "./market-data/contracts";

export interface CoinSnapshot {
  id: string;
  symbol: string;
  name: string;
  marketCap: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  returnPct: number | null;
  amplitude: number | null;
  volatility: number | null;
  returnPct3d?: number | null;
  returnPct7d?: number | null;
  returnPct30d?: number | null;
  volume24h?: number | null;
  isMainstream: boolean;
  source?: MarketDataProvider;
  observedAt?: string;
  fallbackUsed?: boolean;
  fallbackFields?: CoinFallbackField[];
}

export interface SectorSnapshot {
  id: string;
  name: string;
  totalMarketCap: number | null;
  totalVolume24h?: number | null;
  weightedReturnPct: number | null;
  weightedAmplitude: number | null;
  weightedVolatility: number | null;
  weightedReturnPct3d?: number | null;
  weightedReturnPct7d?: number | null;
  weightedReturnPct30d?: number | null;
  coverageRatio?: number;
  coverageByPeriod?: Partial<Record<PeriodType, number>>;
  weightCoverageRatio?: number;
  coins: CoinSnapshot[];
}

export interface DailySnapshot {
  date: string;
  generatedAt: string;
  source: string;
  dataQuality?: DataQuality;
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
  holdings?: string[];
  sectors: SectorConfig[];
}

export interface CanonicalSectorConfig {
  id: string;
  name: string;
  assetIds: string[];
}

export interface CanonicalSectorsFile {
  version: 2;
  registryVersion: 1;
  lastUpdated: string;
  effectiveFrom: string;
  mainStreamThreshold: number;
  holdings?: string[];
  sectors: CanonicalSectorConfig[];
}

export interface CustomSectorConfig {
  id: string;
  name: string;
  coins: string[]; // Canonical asset_id values, e.g. ["bitcoin", "ethereum"]
}

export interface WatchlistConfig {
  version: number;
  sectors: Record<string, { enabled: boolean }>;
  customSectors: CustomSectorConfig[];
}

export interface OkxTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
}
