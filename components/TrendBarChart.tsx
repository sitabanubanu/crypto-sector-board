"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SectorSnapshot, PeriodType } from "@/lib/types";
import { getSectorReturn, hasSectorReturnForPeriod, sectorColorForPeriod, formatPct } from "@/lib/colors";

interface Props {
  sectors: SectorSnapshot[];
  period: PeriodType;
}

const ROW_H = 32;
const BAR_H = 20;
const LABEL_W = 110;
const PCT_W = 70;
const PAD = 12;
const TITLE_H = 36;

export default function TrendBarChart({ sectors, period }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    const data = sectors.map((s) => ({
      id: s.id,
      name: s.name,
      value: getSectorReturn(s, period),
      hasData: hasSectorReturnForPeriod(s, period),
    }));
    data.sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      return b.value - a.value;
    });
    return data;
  }, [sectors, period]);

  const chartH = TITLE_H + rows.length * ROW_H + PAD;

  const barAreaW = Math.max(width - LABEL_W - PAD * 2 - PCT_W, 100);
  const zeroX = LABEL_W + PAD + barAreaW * 0.42;
  const posMax = barAreaW * 0.58;
  const negMax = barAreaW * 0.42;
  const maxPos = Math.max(...rows.filter((r) => r.hasData && r.value >= 0).map((r) => r.value), 0.005);
  const maxNeg = Math.max(...rows.filter((r) => r.hasData && r.value < 0).map((r) => -r.value), 0.005);

  if (width === 0) {
    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        overflow: "auto",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#6b7280",
          padding: "6px 12px",
          borderLeft: "3px solid #38a169",
          margin: "6px 0 2px 0",
        }}
      >
        多时间维度板块对比
      </div>

      <svg width={width} height={chartH} style={{ display: "block" }}>
        {/* zero line */}
        <line
          x1={zeroX}
          y1={TITLE_H}
          x2={zeroX}
          y2={chartH - PAD}
          stroke="#d1d5db"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text x={zeroX} y={TITLE_H - 6} textAnchor="middle" fontSize={10} fill="#9ca3af">
          0%
        </text>

        {rows.map((row, i) => {
          const y = TITLE_H + i * ROW_H + (ROW_H - BAR_H) / 2;
          const labelY = TITLE_H + i * ROW_H + ROW_H / 2;

          if (!row.hasData) {
            return (
              <g key={row.id}>
                <text
                  x={zeroX - 8}
                  y={labelY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#1f2328"
                >
                  {row.name}
                </text>
                <text
                  x={zeroX + 8}
                  y={labelY}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#d1d5db"
                >
                  --
                </text>
              </g>
            );
          }

          const barColor = sectorColorForPeriod(
            sectors.find((s) => s.id === row.id)!,
            period,
          );

          let barX: number;
          let barW: number;
          let pctX: number;
          let pctAnchor: "start" | "end";

          if (row.value >= 0) {
            barW = Math.max((row.value / maxPos) * posMax, row.value === 0 ? 0 : 3);
            barX = zeroX;
            pctX = zeroX + barW + 6;
            pctAnchor = "start";
          } else {
            barW = Math.max((-row.value / maxNeg) * negMax, 3);
            barX = zeroX - barW;
            pctX = zeroX - barW - 6;
            pctAnchor = "end";
          }

          return (
            <g key={row.id}>
              {/* sector name */}
              <text
                x={zeroX - 8}
                y={labelY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="#1f2328"
              >
                {row.name}
              </text>

              {/* bar */}
              <rect
                x={barX}
                y={y}
                width={barW || 0}
                height={BAR_H}
                fill={barColor}
                rx={3}
                ry={3}
                style={{ cursor: "pointer", transition: "opacity 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.setAttribute("opacity", "0.78"); }}
                onMouseLeave={(e) => { e.currentTarget.setAttribute("opacity", "1"); }}
              />

              {/* percentage */}
              <text
                x={pctX}
                y={labelY}
                textAnchor={pctAnchor}
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill={barColor}
              >
                {formatPct(row.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
