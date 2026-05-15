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

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}
