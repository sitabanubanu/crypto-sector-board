"use client";

import { useMemo, useRef, useState } from "react";
import { hierarchy, treemap } from "d3-hierarchy";
import type { DailySnapshot, SectorSnapshot, CoinSnapshot } from "@/lib/types";
import { returnPctToColor, textColorOnBlock, formatPct, formatMarketCap } from "@/lib/colors";

type ViewMode = "detailed" | "overview";

interface Props {
  snapshot: DailySnapshot;
  width: number;
  height: number;
  viewMode: ViewMode;
}

interface HoverInfo {
  coin: CoinSnapshot;
  sectorName: string;
  x: number;
  y: number;
}

export default function SectorTreemap({ snapshot, width, height, viewMode }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHover = (info: HoverInfo) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(info);
  };

  const hideHover = () => {
    hoverTimer.current = setTimeout(() => setHover(null), 60);
  };

  const root = useMemo(() => {
    const coinWeight = (marketCap: number) => {
      const safe = Math.max(marketCap, 1);
      return Math.pow(safe, 0.4) + 800;
    };

    const data = {
      name: "root",
      children: snapshot.sectors.map((sector) => ({
        name: sector.name,
        sector,
        children: sector.coins.map((coin) => ({
          name: coin.symbol,
          coin,
          value: coinWeight(coin.marketCap),
        })),
      })),
    };

    type Datum = {
      name: string;
      sector?: SectorSnapshot;
      coin?: CoinSnapshot;
      value?: number;
      children?: Datum[];
    };

    const h = hierarchy<Datum>(data as Datum)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    return treemap<Datum>().size([width, height]).paddingOuter(8).paddingTop(24).paddingInner(2).round(true)(h);
  }, [snapshot, width, height]);

  const sectorNodes = root.children || [];

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {sectorNodes.map((sectorNode) => {
          const sector = (sectorNode.data as { sector?: SectorSnapshot }).sector!;
          const sectorColor = returnPctToColor(sector.weightedReturnPct);
          const sectorTextColor = textColorOnBlock(sector.weightedReturnPct);
          const sw = sectorNode.x1 - sectorNode.x0;
          const sh = sectorNode.y1 - sectorNode.y0;
          if (sw <= 0 || sh <= 0) return null;

          if (viewMode === "overview") {
            const titleSize = Math.max(12, Math.min(24, Math.sqrt(sw * sh) / 8));
            const pctSize = Math.max(11, Math.min(20, Math.sqrt(sw * sh) / 10));
            return (
              <g key={sector.id}>
                <rect
                  x={sectorNode.x0}
                  y={sectorNode.y0}
                  width={sw}
                  height={sh}
                  fill={sectorColor}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
                <text
                  x={sectorNode.x0 + sw / 2}
                  y={sectorNode.y0 + sh / 2 - pctSize * 0.7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={titleSize}
                  fontWeight={700}
                  fill={sectorTextColor}
                >
                  {sector.name}
                </text>
                <text
                  x={sectorNode.x0 + sw / 2}
                  y={sectorNode.y0 + sh / 2 + titleSize * 0.7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={pctSize}
                  fontWeight={700}
                  fill={sectorTextColor}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatPct(sector.weightedReturnPct)}
                </text>
              </g>
            );
          }

          return (
            <g key={sector.id}>
              <rect
                x={sectorNode.x0}
                y={sectorNode.y0}
                width={sw}
                height={sh}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                rx={4}
                ry={4}
              />
              <clipPath id={`clip-${sector.id}`}>
                <rect x={sectorNode.x0} y={sectorNode.y0} width={sw} height={sh} rx={4} ry={4} />
              </clipPath>
              <rect
                x={sectorNode.x0}
                y={sectorNode.y0}
                width={sw}
                height={24}
                fill={sectorColor}
                clipPath={`url(#clip-${sector.id})`}
              />
              <text
                x={sectorNode.x0 + 8}
                y={sectorNode.y0 + 16}
                fontSize={13}
                fontWeight={600}
                fill={sectorTextColor}
              >
                {sector.name}
              </text>
              <text
                x={sectorNode.x0 + sw - 8}
                y={sectorNode.y0 + 16}
                textAnchor="end"
                fontSize={13}
                fontWeight={700}
                fill={sectorTextColor}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatPct(sector.weightedReturnPct)}
              </text>

              {(sectorNode.children || []).map((coinNode) => {
                const coin = (coinNode.data as { coin?: CoinSnapshot }).coin!;
                const cw = coinNode.x1 - coinNode.x0;
                const ch = coinNode.y1 - coinNode.y0;
                if (cw <= 0 || ch <= 0) return null;
                const coinColor = returnPctToColor(coin.returnPct);
                const coinTextColor = textColorOnBlock(coin.returnPct);
                const area = cw * ch;
                const symbolSize = Math.max(10, Math.min(16, Math.sqrt(area) / 6.5));
                const pctSize = Math.max(9, Math.min(13, symbolSize - 1));
                const showText = cw > 24 && ch > 18;
                const showPct = showText && cw > 36 && ch > 30;

                return (
                  <g
                    key={coin.id}
                    onMouseEnter={(e) =>
                      showHover({
                        coin,
                        sectorName: sector.name,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      showHover({
                        coin,
                        sectorName: sector.name,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseLeave={() => hideHover()}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={coinNode.x0}
                      y={coinNode.y0}
                      width={cw}
                      height={ch}
                      fill={coinColor}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      clipPath={`url(#clip-${sector.id})`}
                      style={{ transition: "opacity 0.12s" }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        el.setAttribute("opacity", "0.78");
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.setAttribute("opacity", "1");
                      }}
                    />
                    {showText && (
                      <>
                        <text
                          x={coinNode.x0 + cw / 2}
                          y={showPct ? coinNode.y0 + ch / 2 - pctSize / 2 : coinNode.y0 + ch / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={symbolSize}
                          fontWeight={700}
                          fill={coinTextColor}
                        >
                          {coin.symbol}
                        </text>
                        {showPct && (
                          <text
                            x={coinNode.x0 + cw / 2}
                            y={coinNode.y0 + ch / 2 + symbolSize / 2 + 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={pctSize}
                            fontWeight={500}
                            fill={coinTextColor}
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {formatPct(coin.returnPct)}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {hover && <Tooltip info={hover} />}
    </div>
  );
}

function Tooltip({ info }: { info: HoverInfo }) {
  const { coin, sectorName, x, y } = info;
  const offset = 12;
  const tooltipWidth = 240;
  const tooltipHeight = 200;
  const left = Math.min(
    Math.max(x + offset, offset),
    window.innerWidth - tooltipWidth - offset
  );
  const top = Math.min(
    Math.max(y + offset, offset),
    window.innerHeight - tooltipHeight - offset
  );

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.6,
        color: "#1f2328",
        borderRadius: 6,
        pointerEvents: "none",
        minWidth: 220,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
        {coin.name}{" "}
        <span style={{ color: "#6b7280", fontWeight: 400 }}>
          ({coin.symbol})
        </span>
      </div>
      <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 6 }}>
        板块：{sectorName}
      </div>
      <Row label="开盘" value={`$${coin.open.toFixed(coin.open < 1 ? 6 : 2)}`} />
      <Row label="最高" value={`$${coin.high.toFixed(coin.high < 1 ? 6 : 2)}`} />
      <Row label="最低" value={`$${coin.low.toFixed(coin.low < 1 ? 6 : 2)}`} />
      <Row label="收盘" value={`$${coin.close.toFixed(coin.close < 1 ? 6 : 2)}`} />
      <Row
        label="24h 涨跌"
        value={formatPct(coin.returnPct)}
        valueColor={returnPctToColor(coin.returnPct)}
      />
      <Row label="振幅" value={`${(coin.amplitude * 100).toFixed(2)}%`} />
      <Row label="市值" value={formatMarketCap(coin.marketCap)} />
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: valueColor || "#1f2328", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
