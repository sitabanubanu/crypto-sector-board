"use client";

import type { CoinSnapshot, SectorSnapshot } from "@/lib/types";
import type { AssetInsight } from "@/lib/market-insights";
import { getCoinReturn, hasCoinReturnForPeriod, coinColorForPeriod, formatPct, formatMarketCap } from "@/lib/colors";

interface Props {
  coin: CoinSnapshot;
  sectorName: string;
  sector: SectorSnapshot;
  insight?: AssetInsight;
  closes?: number[]; // daily closes, most recent first (7-30 entries)
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

function turnoverRatio(
  volume24h: number | null | undefined,
  marketCap: number | null,
): number | null {
  if (!volume24h || volume24h <= 0 || marketCap == null || marketCap <= 0) return null;
  return volume24h / marketCap;
}

export default function CoinDetailModal({ coin, sectorName, sector, insight, closes, onClose }: Props) {
  const turnover = turnoverRatio(coin.volume24h, coin.marketCap);
  const sectorTurnover = turnoverRatio(sector.totalVolume24h, sector.totalMarketCap);

  // Build performance vs sector evaluation
  const evaluations: string[] = [];
  for (const p of PERIODS) {
    const cr = getCoinReturn(coin, p.key);
    const sr = getSectorAvgReturn(sector, p.key);
    if (cr != null && sr != null && sr !== 0) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="coin-detail-title"
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
            <div id="coin-detail-title" style={{ fontSize: 18, fontWeight: 700, color: "#1f2328" }}>
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
            aria-label="关闭币种详情"
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
                {coin.close == null
                  ? "N/A"
                  : `$${coin.close.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}`}
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
                {coin.volume24h != null ? formatMarketCap(coin.volume24h) : "N/A"}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>
                成交活跃度（量/市值）
                {turnover != null && sectorTurnover != null && turnover > sectorTurnover * 2 && (
                  <span style={{ color: "#e53e3e", marginLeft: 4 }}>⚠ 高于板块</span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2328" }}>
                {turnover != null ? `${(turnover * 100).toFixed(3)}%` : "N/A"}
              </div>
            </div>
          </div>
        </div>

        {/* Mini sparkline — 7 day price trend */}
        {closes && closes.length >= 3 && (
          <Sparkline closes={closes.slice(0, 7)} />
        )}

        {/* Period returns */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f1f3" }}>
          {PERIODS.map((p) => {
            const hasData = hasCoinReturnForPeriod(coin, p.key);
            const coinRet = getCoinReturn(coin, p.key);
            const sectorRet = getSectorAvgReturn(sector, p.key);
            const color = coinColorForPeriod(coin, p.key);
            const barW =
              hasData && coinRet != null
                ? Math.min(Math.abs(coinRet) * 400, 120)
                : 0;

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
                  <span style={{ fontSize: 11, color: "#d1d5db" }}>N/A</span>
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
            成交活跃度只表示成交量相对市值的大小，不等同于真实资金流入，也不能据此判断吸筹或出货。
          </div>
        </div>

        {insight && (
          <div style={{ padding: "14px 20px 18px", borderTop: "1px solid #f0f1f3" }}>
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 700, marginBottom: 6 }}>
              项目档案 · {insight.role}
            </div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, marginBottom: 8 }}>
              {insight.thesis}
            </div>
            <InsightList label="主要用途" items={insight.useCases} />
            <InsightList label="需求信号" items={insight.demandSignals} />
            <InsightList label="主要风险" items={insight.riskNotes} />
            <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
              资料来源：{insight.sources.map((source) => (
                <a key={source} href={source} target="_blank" rel="noreferrer" style={{ color: "#2563eb", marginLeft: 4, overflowWrap: "anywhere" }}>
                  {source.replace(/^https?:\/\//, "").split("/")[0]}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function InsightList({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

// Mini 7-day price sparkline
function Sparkline({ closes }: { closes: number[] }) {
  // closes are most recent first; reverse for chronological display
  const data = [...closes].reverse();
  const n = data.length;
  const w = 320;
  const h = 80;
  const pad = { top: 12, right: 8, bottom: 16, left: 8 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xScale = (i: number) => pad.left + (i / (n - 1)) * plotW;
  const yScale = (v: number) => pad.top + plotH - ((v - min) / range) * plotH;

  const points = data.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ");
  const areaPoints = `${xScale(0)},${pad.top + plotH} ${points} ${xScale(n - 1)},${pad.top + plotH}`;
  const trend = data[data.length - 1] >= data[0] ? "#fed7d7" : "#c6f6d5";
  const trendStroke = data[data.length - 1] >= data[0] ? "#e53e3e" : "#38a169";

  // Day labels (show every other day)
  const days = data.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  });

  return (
    <div style={{ padding: "8px 20px", borderBottom: "1px solid #f0f1f3" }}>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>近 {n} 天价格走势</div>
      <svg width={w} height={h} style={{ display: "block", width: "100%", height: "auto" }}>
        {/* Area fill */}
        <polygon points={areaPoints} fill={trend} opacity={0.4} />
        {/* Line */}
        <polyline points={points} fill="none" stroke={trendStroke} strokeWidth={1.5} />
        {/* Day labels */}
        {days.map((label, i) => {
          if (i % 2 !== 0 && i !== n - 1 && i !== 0) return null;
          return (
            <text
              key={i}
              x={xScale(i)}
              y={h - 2}
              textAnchor="middle"
              fontSize={7}
              fill="#9ca3af"
            >
              {label}
            </text>
          );
        })}
        {/* Min/Max labels */}
        <text x={pad.left} y={pad.top - 2} fontSize={7} fill="#9ca3af">
          ${max.toFixed(max < 1 ? 4 : 2)}
        </text>
        <text x={pad.left} y={pad.top + plotH - 2} fontSize={7} fill="#9ca3af">
          ${min.toFixed(min < 1 ? 4 : 2)}
        </text>
      </svg>
    </div>
  );
}
