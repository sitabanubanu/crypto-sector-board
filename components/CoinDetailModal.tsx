"use client";

import type { CoinSnapshot, SectorSnapshot } from "@/lib/types";
import { getCoinReturn, hasCoinReturnForPeriod, coinColorForPeriod, formatPct, formatMarketCap } from "@/lib/colors";

interface Props {
  coin: CoinSnapshot;
  sectorName: string;
  sector: SectorSnapshot;
  onClose: () => void;
}

const PERIODS = [
  { key: "24h" as const, label: "24h 涨跌" },
  { key: "3d" as const, label: "3d 涨跌" },
  { key: "7d" as const, label: "7d 涨跌" },
  { key: "30d" as const, label: "30d 涨跌" },
];

function getSectorAvgReturn(sector: SectorSnapshot, period: "24h" | "3d" | "7d" | "30d"): number | null {
  if (period === "3d") return sector.weightedReturnPct3d ?? null;
  if (period === "7d") return sector.weightedReturnPct7d ?? null;
  if (period === "30d") return sector.weightedReturnPct30d ?? null;
  return sector.weightedReturnPct;
}

function turnoverRatio(volume24h: number | undefined, marketCap: number): number | null {
  if (!volume24h || volume24h <= 0 || marketCap <= 0) return null;
  return volume24h / marketCap;
}

export default function CoinDetailModal({ coin, sectorName, sector, onClose }: Props) {
  const turnover = turnoverRatio(coin.volume24h, coin.marketCap);
  const sectorTurnover = turnoverRatio(sector.totalVolume24h, sector.totalMarketCap);

  // Build performance vs sector evaluation
  const evaluations: string[] = [];
  for (const p of PERIODS) {
    const cr = getCoinReturn(coin, p.key);
    const sr = getSectorAvgReturn(sector, p.key);
    if (sr != null && sr !== 0) {
      if (cr > sr) evaluations.push(`${p.key}跑赢板块`);
      else evaluations.push(`${p.key}落后板块`);
    }
  }
  const evalText = evaluations.length > 0
    ? evaluations.slice(0, 2).join("，")
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          width: 380,
          maxWidth: "92vw",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1f2328" }}>
              {coin.symbol}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
              {coin.name}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              板块：{sectorName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: "#9ca3af",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Key metrics */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f1f3" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>当前价格</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2328" }}>
                ${coin.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>市值</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2328" }}>
                {formatMarketCap(coin.marketCap)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>24h 成交量</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2328" }}>
                {coin.volume24h != null ? formatMarketCap(coin.volume24h) : "--"}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>
                换手率
                {turnover != null && sectorTurnover != null && turnover > sectorTurnover * 2 && (
                  <span style={{ color: "#e53e3e", marginLeft: 4 }}>⚠ 异常活跃</span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2328" }}>
                {turnover != null ? `${(turnover * 100).toFixed(3)}%` : "--"}
              </div>
            </div>
          </div>
        </div>

        {/* Period returns */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f1f3" }}>
          {PERIODS.map((p) => {
            const hasData = hasCoinReturnForPeriod(coin, p.key);
            const coinRet = getCoinReturn(coin, p.key);
            const sectorRet = getSectorAvgReturn(sector, p.key);
            const color = coinColorForPeriod(coin, p.key);
            const barW = hasData ? Math.min(Math.abs(coinRet) * 400, 120) : 0;

            return (
              <div
                key={p.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 11, color: "#6b7280", width: 50, flexShrink: 0 }}>
                  {p.label}
                </span>
                {hasData ? (
                  <>
                    <div
                      style={{
                        height: 14,
                        width: barW,
                        background: color,
                        borderRadius: 3,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color, flexShrink: 0, width: 60, textAlign: "right" }}>
                      {formatPct(coinRet)}
                    </span>
                    {sectorRet != null && (
                      <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>
                        vs 板块 {formatPct(sectorRet)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: "#d1d5db" }}>--</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Performance summary */}
        <div style={{ padding: "14px 20px" }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
            表现评价
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: evalText.includes("跑赢") ? "#c81e1e" : evalText.includes("落后") ? "#38a169" : "#6b7280",
              padding: "10px 14px",
              background: "#f8f9fb",
              borderRadius: 8,
              lineHeight: 1.6,
            }}
          >
            {evalText || "数据不足，无法评价"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>
            高换手率 = 资金关注度高。异常活跃（换手率超过板块均值 2 倍）可能意味着出货或吸筹。
          </div>
        </div>
      </div>
    </>
  );
}
