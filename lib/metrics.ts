import type { CoinMarketItem } from "./coingecko";

export function calcCoinMetricsFromMarket(coin: CoinMarketItem) {
  const high = coin.high_24h;
  const low = coin.low_24h;
  const close = coin.current_price;
  const returnPct = (coin.price_change_percentage_24h || 0) / 100;
  const open = close / (1 + returnPct);

  const amplitude = low > 0 ? high / low - 1 : 0;
  const volatility = amplitude / 2;

  return { open, high, low, close, returnPct, amplitude, volatility };
}

export function calcWeightedSectorMetrics(
  coins: { returnPct: number; amplitude: number; volatility: number; marketCap: number; isMainstream: boolean }[]
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

  return { weightedReturnPct, weightedAmplitude, weightedVolatility };
}
