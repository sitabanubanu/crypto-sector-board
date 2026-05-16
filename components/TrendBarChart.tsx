"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SectorSnapshot } from "@/lib/types";
import { getSectorReturn, hasSectorReturnForPeriod, sectorColorForPeriod, formatPct } from "@/lib/colors";

interface Props {
  sectors: SectorSnapshot[];
}

const ROW_H = 34;
const BAR_H = 20;
const LABEL_W = 100;
const PAD = 12;
const HEADER_H = 28;
const TITLE_H = 32;
const FOOTER_H = 36;
const COL_GAP = 16;

const PERIODS = [
  { key: "24h" as const, label: "24h" },
  { key: "7d" as const, label: "7d" },
  { key: "30d" as const, label: "30d" },
];

export default function TrendBarChart({ sectors }: Props) {
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

  // Compute rows: each sector has 3 return values
  const rows = useMemo(() => {
    const data = sectors.map((s) => ({
      id: s.id,
      name: s.name,
      values: PERIODS.map((p) => ({
        key: p.key,
        value: getSectorReturn(s, p.key),
        hasData: hasSectorReturnForPeriod(s, p.key),
      })),
    }));
    // Sort by 24h return descending
    data.sort((a, b) => b.values[0].value - a.values[0].value);
    return data;
  }, [sectors]);

  const chartH = TITLE_H + HEADER_H + rows.length * ROW_H + PAD + FOOTER_H;

  // Column layout: 3 equal-width groups after the label area
  const colW = width > 0 ? Math.max((width - LABEL_W - PAD * 2 - COL_GAP * 2) / 3, 40) : 40;
  const NEG_RATIO = 0.4; // 40% of column width for negative side

  // Per-period max values for bar scaling
  const maxVals = PERIODS.map((p) => {
    const vals = rows
      .map((r) => r.values.find((v) => v.key === p.key)!)
      .filter((v) => v.hasData);
    const pos = Math.max(...vals.map((v) => Math.max(v.value, 0)), 0.005);
    const neg = Math.max(...vals.map((v) => Math.max(-v.value, 0)), 0.005);
    return { pos, neg };
  });

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
      <svg width={width} height={chartH} style={{ display: "block" }}>
        {/* Title */}
        <text x={PAD} y={20} fontSize={11} fontWeight={500} fill="#6b7280">
          多时间维度板块对比
        </text>
        <line x1={PAD} y1={26} x2={PAD} y2={26} stroke="#38a169" strokeWidth={0} />

        {/* Column headers */}
        {PERIODS.map((p, ci) => {
          const colStart = LABEL_W + PAD + ci * (colW + COL_GAP);
          const zeroX = colStart + colW * NEG_RATIO;
          return (
            <g key={p.key}>
              <text
                x={zeroX}
                y={TITLE_H + 14}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#6b7280"
              >
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Rows */}
        {rows.map((row, ri) => {
          const rowY = TITLE_H + HEADER_H + ri * ROW_H;
          const labelY = rowY + ROW_H / 2;

          return (
            <g key={row.id}>
              {/* Background stripe */}
              <rect
                x={0}
                y={rowY}
                width={width}
                height={ROW_H}
                fill={ri % 2 === 0 ? "#ffffff" : "#fafbfc"}
              />

              {/* Sector name */}
              <text
                x={LABEL_W}
                y={labelY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="#1f2328"
              >
                {row.name}
              </text>

              {/* Three period columns */}
              {PERIODS.map((p, ci) => {
                const v = row.values[ci];
                const colStart = LABEL_W + PAD + ci * (colW + COL_GAP);
                const zeroX = colStart + colW * NEG_RATIO;
                const barY = rowY + (ROW_H - BAR_H) / 2;
                const negArea = colW * NEG_RATIO - 4; // 4px gap from edge
                const posArea = colW * (1 - NEG_RATIO) - 4;

                if (!v.hasData) {
                  return (
                    <g key={p.key}>
                      <line
                        x1={colStart + 4}
                        y1={labelY}
                        x2={colStart + colW - 4}
                        y2={labelY}
                        stroke="#d1d5db"
                        strokeWidth={1}
                      />
                      <text
                        x={zeroX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={11}
                        fill="#d1d5db"
                      >
                        --
                      </text>
                    </g>
                  );
                }

                const sector = sectors.find((s) => s.id === row.id)!;
                const barColor = sectorColorForPeriod(sector, p.key);
                const absVal = Math.abs(v.value);
                let barX: number;
                let barW: number;
                let pctX: number;
                let pctAnchor: "start" | "end";

                if (v.value >= 0) {
                  barW = Math.max((absVal / maxVals[ci].pos) * posArea, absVal === 0 ? 0 : 3);
                  barX = zeroX;
                  pctX = barW > 50 ? zeroX + barW - 6 : zeroX + barW + 4;
                  pctAnchor = barW > 50 ? "end" : "start";
                } else {
                  barW = Math.max((absVal / maxVals[ci].neg) * negArea, 3);
                  barX = zeroX - barW;
                  pctX = barW > 50 ? zeroX - barW + 6 : zeroX - barW - 4;
                  pctAnchor = barW > 50 ? "start" : "end";
                }

                return (
                  <g key={p.key}>
                    {/* Zero line (subtle, per column) */}
                    <line
                      x1={zeroX}
                      y1={rowY + 2}
                      x2={zeroX}
                      y2={rowY + ROW_H - 2}
                      stroke="#e5e7eb"
                      strokeWidth={1}
                    />

                    {/* Bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barW || 0}
                      height={BAR_H}
                      fill={barColor}
                      rx={3}
                      ry={3}
                    />

                    {/* Percentage */}
                    <text
                      x={pctX}
                      y={labelY}
                      textAnchor={pctAnchor}
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={barColor}
                    >
                      {formatPct(v.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Usage footer */}
        <text
          x={PAD}
          y={chartH - 12}
          fontSize={10}
          fill="#9ca3af"
        >
          用法：三列对比看趋势一致性 — 红柱(涨)越长越强、绿柱(跌)越长越弱。24h+7d+30d全红→强势确认；24h绿但7d/30d红→短期回调机会；24h红但7d/30d绿→谨防诱多陷阱；全绿→板块走弱回避。按24h涨跌排序。
        </text>
      </svg>
    </div>
  );
}
