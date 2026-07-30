import type {
  Candle,
  MarketQuote,
  ProviderIssue,
} from "@/lib/market-data/contracts";

export const HOUR_MS = 60 * 60 * 1_000;

export type IngestionProvider = "coingecko" | "gate" | "okx";
export type CandleProvider = Extract<IngestionProvider, "gate" | "okx">;
export type IngestionRunStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped_duplicate";

export interface ActiveInstrument {
  assetId: string;
  instrumentId: string;
}

export interface CandleFetchRequest extends ActiveInstrument {
  from: Date;
  toExclusive: Date;
  timeframe: "1h";
}

export interface CandleFetchResult {
  candles: Candle[];
  issues: ProviderIssue[];
}

export interface ProviderCandleAdapter {
  provider: CandleProvider;
  minimumDelayMs: number;
  fetchCandles(request: CandleFetchRequest): Promise<CandleFetchResult>;
}

export interface QuoteFetchResult {
  quotes: MarketQuote[];
  issues: Array<ProviderIssue & { assetId?: string }>;
}

export interface ProviderQuoteAdapter {
  provider: IngestionProvider;
  fetchQuotes(instruments: ActiveInstrument[]): Promise<QuoteFetchResult>;
}

export interface IngestionRunResult {
  task: "candles" | "quotes";
  provider: IngestionProvider;
  timeframe: "1h" | null;
  bucket: string;
  status: IngestionRunStatus;
  requestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  coverageRatio: number;
  errors: Array<Record<string, unknown>>;
}
