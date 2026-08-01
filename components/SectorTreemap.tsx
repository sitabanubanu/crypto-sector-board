"use client";

import { useMemo, useRef, useState } from "react";
import { hierarchy, treemap } from "d3-hierarchy";
import type { DailySnapshot, SectorSnapshot, CoinSnapshot, PeriodType } from "@/lib/types";
import type { SectorSignal } from "@/lib/signals";
import { formatPct, formatMarketCap, getSectorReturn, getCoinReturn, sectorColorForPeriod, sectorTextColorForPeriod, coinColorForPeriod, coinTextColorForPeriod } from "@/lib/colors";

type ViewMode = "detailed" | "overview";

interface Props {
  snapshot: DailySnapshot;
  width: number;
  height: number;
  viewMode: ViewMode;
  period: PeriodType;
  signals?: Map<string, SectorSignal>;
  focusAssets?: string[];
  highlightedAssetIds?: ReadonlySet<string>;
  highlightedSectorIds?: ReadonlySet<string>;
  hasSearchHighlight?: boolean;
  onCoinClick?: (coin: CoinSnapshot, sectorName: string) => void;
}

interface HoverInfo {
  coin: CoinSnapshot;
  sectorName: string;
  x: number;
  y: number;
}

export default function SectorTreemap({
  snapshot,
  width,
  height,
  viewMode,
  period,
  signals,
  focusAssets,
  highlightedAssetIds,
  highlightedSectorIds,
  hasSearchHighlight = false,
  onCoinClick,
}: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAssetsSet = useMemo(
    () => new Set(focusAssets ?? []),
    [focusAssets],
  );

  const showHover = (info: HoverInfo) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(info);
  };

  const hideHover = () => {
    hoverTimer.current = setTimeout(() => setHover(null), 60);
  };

  const root = useMemo(() => {
    const coinWeight = (marketCap: number | null) => {
      const safe = Math.max(marketCap ?? 0, 1);
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
      .sort((a, b) => {
        // Sort coin children by period return (best first), sectors by value
        const aCoin = a.data.coin;
        const bCoin = b.data.coin;
        if (aCoin && bCoin) {
          return (
            (getCoinReturn(bCoin, period) ?? Number.NEGATIVE_INFINITY) -
            (getCoinReturn(aCoin, period) ?? Number.NEGATIVE_INFINITY)
          );
        }
        return (b.value || 0) - (a.value || 0);
      });

    return treemap<Datum>().size([width, height]).paddingOuter(8).paddingTop(24).paddingInner(2).round(true)(h);
  }, [snapshot, width, height, period]);

  const sectorNodes = root.children || [];

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {sectorNodes.map((sectorNode) => {
          const sector = (sectorNode.data as { sector?: SectorSnapshot }).sector!;
          const sectorColor = sectorColorForPeriod(sector, period);
          const sectorTextColor = sectorTextColorForPeriod(sector, period);
          const sw = sectorNode.x1 - sectorNode.x0;
          const sh = sectorNode.y1 - sectorNode.y0;
          if (sw <= 0 || sh <= 0) return null;
          const sectorDirectlyHighlighted =
            highlightedSectorIds?.has(sector.id) ?? false;
          const containsHighlightedAsset = sector.coins.some((coin) =>
            highlightedAssetIds?.has(coin.id),
          );
          const sectorHighlighted =
            sectorDirectlyHighlighted || containsHighlightedAsset;
          const sectorOpacity =
            hasSearchHighlight && !sectorHighlighted ? 0.18 : 1;

          if (viewMode === "overview") {
            const titleSize = Math.max(12, Math.min(24, Math.sqrt(sw * sh) / 8));
            const pctSize = Math.max(11, Math.min(20, Math.sqrt(sw * sh) / 10));
            const sig = signals?.get(sector.id);
            return (
              <g key={sector.id} opacity={sectorOpacity}>
                <rect
                  x={sectorNode.x0}
                  y={sectorNode.y0}
                  width={sw}
                  height={sh}
                  fill={sectorColor}
                  stroke={sectorHighlighted ? "#2563eb" : "#ffffff"}
                  strokeWidth={sectorHighlighted ? 3 : 1}
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
                  {sig ? `${sig.icon} ${sector.name}` : sector.name}
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
                  {formatPct(getSectorReturn(sector, period))}
                </text>
              </g>
            );
          }

          const sig = signals?.get(sector.id);

          return (
            <g key={sector.id} opacity={sectorOpacity}>
              <rect
                x={sectorNode.x0}
                y={sectorNode.y0}
                width={sw}
                height={sh}
                fill="#ffffff"
                stroke={sectorHighlighted ? "#2563eb" : "#cbd5e1"}
                strokeWidth={sectorHighlighted ? 3 : 1.5}
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
                fontSize={sw < 100 ? 10 : sw < 140 ? 11 : 13}
                fontWeight={600}
                fill={sectorTextColor}
              >
                {sig ? (sw < 80 ? sig.icon : `${sig.icon} ${sector.name}`) : sector.name}
              </text>
              {sw >= 70 && (
                <text
                  x={sectorNode.x0 + sw - 8}
                  y={sectorNode.y0 + 16}
                  textAnchor="end"
                  fontSize={sw < 110 ? 10 : 13}
                  fontWeight={700}
                  fill={sectorTextColor}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatPct(getSectorReturn(sector, period))}
                </text>
              )}

              {(sectorNode.children || []).map((coinNode) => {
                const coin = (coinNode.data as { coin?: CoinSnapshot }).coin!;
                const cw = coinNode.x1 - coinNode.x0;
                const ch = coinNode.y1 - coinNode.y0;
                if (cw <= 0 || ch <= 0) return null;
                const coinColor = coinColorForPeriod(coin, period);
                const coinTextColor = coinTextColorForPeriod(coin, period);
                const area = cw * ch;
                const symbolSize = Math.max(10, Math.min(16, Math.sqrt(area) / 6.5));
                const pctSize = Math.max(9, Math.min(13, symbolSize - 1));
                const showText = cw > 24 && ch > 18;
                const showPct = showText && cw > 36 && ch > 30;

                // Volume-based border: thicker = higher turnover
                const turnover = coin.volume24h && coin.marketCap != null && coin.marketCap > 0
                  ? coin.volume24h / coin.marketCap
                  : 0;
                const borderW = 0.5 + Math.min(turnover * 600, 2.5);
                const coinHighlighted =
                  sectorDirectlyHighlighted ||
                  (highlightedAssetIds?.has(coin.id) ?? false);
                const coinOpacity =
                  hasSearchHighlight && !coinHighlighted ? 0.24 : 1;

                return (
                  <g
                    key={coin.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${coin.name}（${coin.symbol}），${sector.name}，${PERIOD_LABEL[period]} ${formatPct(getCoinReturn(coin, period))}${focusAssetsSet.has(coin.id) ? "，关注资产" : ""}`}
                    opacity={coinOpacity}
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
                    onClick={() => onCoinClick?.(coin, sector.name)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCoinClick?.(coin, sector.name);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{`${coin.name}（${coin.symbol}）· ${sector.name}`}</title>
                    <rect
                      x={coinNode.x0}
                      y={coinNode.y0}
                      width={cw}
                      height={ch}
                      fill={coinColor}
                      stroke={coinHighlighted ? "#2563eb" : "#ffffff"}
                      strokeWidth={coinHighlighted ? Math.max(3, borderW) : borderW}
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
                    {/* Gold star marks a focus asset, not a real position. */}
                    {focusAssetsSet.has(coin.id) && cw > 16 && ch > 16 && (
                      <text
                        x={coinNode.x0 + cw - 4}
                        y={coinNode.y0 + (cw < 32 ? 10 : 12)}
                        textAnchor="end"
                        fontSize={Math.min(cw < 30 ? 8 : 11, ch < 24 ? 8 : 11)}
                        fill="#f59e0b"
                        style={{ pointerEvents: "none" }}
                      >
                        ★
                      </text>
                    )}
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
                            {formatPct(getCoinReturn(coin, period))}
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

      {hover && (
        <Tooltip
          info={hover}
          period={period}
          isFocused={focusAssetsSet.has(hover.coin.id)}
        />
      )}
    </div>
  );
}

const PERIOD_LABEL: Record<PeriodType, string> = { "24h": "24h 涨跌", "3d": "3d 涨跌", "7d": "7d 涨跌", "30d": "30d 涨跌" };

function Tooltip({
  info,
  period,
  isFocused,
}: {
  info: HoverInfo;
  period: PeriodType;
  isFocused: boolean;
}) {
  const { coin, sectorName, x, y } = info;
  const offset = 12;
  const tooltipWidth = 240;
  const tooltipHeight = 220;
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
      <Row label="开盘" value={formatPrice(coin.open)} />
      <Row label="最高" value={formatPrice(coin.high)} />
      <Row label="最低" value={formatPrice(coin.low)} />
      <Row label="当前" value={formatPrice(coin.close)} />
      {isFocused && (
        <Row label="关注状态" value="★ 已关注（非真实持仓）" />
      )}
      <Row
        label={PERIOD_LABEL[period]}
        value={formatPct(getCoinReturn(coin, period))}
        valueColor={coinColorForPeriod(coin, period)}
      />
      <Row
        label="振幅"
        value={coin.amplitude == null ? "N/A" : `${(coin.amplitude * 100).toFixed(2)}%`}
      />
      {coin.volume24h != null && coin.volume24h > 0 && (
        <Row label="24h 成交量" value={formatMarketCap(coin.volume24h)} />
      )}
      <Row label="市值" value={formatMarketCap(coin.marketCap)} />
      <Row
        label="数据源"
        value={`${coin.source ?? "snapshot"}${coin.fallbackUsed ? "（兜底）" : ""}`}
      />
      <Row
        label="观测时间"
        value={formatObservedAt(coin.observedAt)}
      />
    </div>
  );
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `$${value.toFixed(value < 1 ? 6 : 2)}`;
}

function formatObservedAt(value: string | undefined): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return `${date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: valueColor || "#1f2328", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
