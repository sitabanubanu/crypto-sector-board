import type { CoinMarketItem } from "./coingecko";

export function calcCoinMetricsFromMarket(coin: CoinMarketItem) {
  const high = coin.high_24h;
  const low = coin.low_24h;
  const close = coin.current_price;
  const returnPct = (coin.price_change_percentage_24h || 0) / 100;
  const open = close / (1 + returnPct);

  const returnPct7d = (coin.price_change_percentage_7d_in_currency ?? 0) / 100;
  const returnPct30d = (coin.price_change_percentage_30d_in_currency ?? 0) / 100;

  const amplitude = low > 0 ? high / low - 1 : 0;
  const volatility = amplitude / 2;

  return { open, high, low, close, returnPct, amplitude, volatility, returnPct7d, returnPct30d };
}

export function calcWeightedSectorMetrics(
  coins: { returnPct: number; amplitude: number; volatility: number; returnPct3d?: number; returnPct7d?: number; returnPct30d?: number; marketCap: number; isMainstream: boolean }[]
) {
  const mainstream = coins.filter((c) => c.isMainstream);
  if (mainstream.length === 0) {
    return { weightedReturnPct: 0, weightedAmplitude: 0, weightedVolatility: 0 };
  }

  const totalCap = mainstream.reduce((sum, c) => sum + c.marketCap, 0);
  if (totalCap === 0) {
    return { weightedReturnPct: 0, weightedAmplitude: 0, weightedVolatility: 0 };
  }

  const weightedReturnPct = mainstream.reduce((sum, c) => sum + c.returnPct * c.marketCap, 0) / totalCap;
  const weightedAmplitude = mainstream.reduce((sum, c) => sum + c.amplitude * c.marketCap, 0) / totalCap;
  const weightedVolatility = mainstream.reduce((sum, c) => sum + c.volatility * c.marketCap, 0) / totalCap;

  // 3d/7d/30d: only include coins that HAVE the data, so missing coins don't dilute the average toward 0
  const with3d = mainstream.filter((c) => c.returnPct3d != null);
  const with7d = mainstream.filter((c) => c.returnPct7d != null);
  const with30d = mainstream.filter((c) => c.returnPct30d != null);

  const cap3d = with3d.reduce((s, c) => s + c.marketCap, 0);
  const cap7d = with7d.reduce((s, c) => s + c.marketCap, 0);
  const cap30d = with30d.reduce((s, c) => s + c.marketCap, 0);

  const weightedReturnPct3d = cap3d > 0
    ? with3d.reduce((s, c) => s + c.returnPct3d! * c.marketCap, 0) / cap3d
    : undefined;
  const weightedReturnPct7d = cap7d > 0
    ? with7d.reduce((s, c) => s + c.returnPct7d! * c.marketCap, 0) / cap7d
    : undefined;
  const weightedReturnPct30d = cap30d > 0
    ? with30d.reduce((s, c) => s + c.returnPct30d! * c.marketCap, 0) / cap30d
    : undefined;

  return { weightedReturnPct, weightedAmplitude, weightedVolatility, weightedReturnPct3d, weightedReturnPct7d, weightedReturnPct30d };
}
