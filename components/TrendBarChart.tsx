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
const COL_GAP = 1; // thin divider, not a gap

const PERIODS = [
  { key: "24h" as const, label: "24h 涨跌" },
  { key: "7d" as const, label: "7d 涨跌" },
  { key: "30d" as const, label: "30d 涨跌" },
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
    data.sort((a, b) => b.values[0].value - a.values[0].value);
    return data;
  }, [sectors]);

  const chartH = TITLE_H + HEADER_H + rows.length * ROW_H + PAD + FOOTER_H;

  const colW = width > 0 ? Math.max((width - LABEL_W - PAD * 2 - COL_GAP * 2) / 3, 60) : 60;
  const NEG_RATIO = 0.4;

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

  const chartLeft = LABEL_W + PAD;
  const chartRight = width - PAD;
  const chartWidth = chartRight - chartLeft;

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
        <text x={PAD} y={20} fontSize={12} fontWeight={600} fill="#1f2328">
          多时间维度板块对比
        </text>

        {/* Unified panel background */}
        <rect
          x={chartLeft}
          y={TITLE_H}
          width={chartWidth}
          height={HEADER_H + rows.length * ROW_H}
          fill="#fafbfc"
          stroke="#e5e7eb"
          strokeWidth={1}
          rx={4}
        />

        {/* Column dividers */}
        {PERIODS.map((p, ci) => {
          if (ci === 0) return null;
          const divX = chartLeft + ci * colW + (ci - 1) * COL_GAP + COL_GAP / 2;
          return (
            <line
              key={`div-${p.key}`}
              x1={divX}
              y1={TITLE_H}
              x2={divX}
              y2={TITLE_H + HEADER_H + rows.length * ROW_H}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          );
        })}

        {/* Header row background */}
        <rect
          x={chartLeft}
          y={TITLE_H}
          width={chartWidth}
          height={HEADER_H}
          fill="#f0f1f3"
          rx={4}
        />
        {/* Mask bottom corners of header */}
        <rect
          x={chartLeft}
          y={TITLE_H + HEADER_H - 4}
          width={chartWidth}
          height={4}
          fill="#f0f1f3"
        />

        {/* Column headers */}
        {PERIODS.map((p, ci) => {
          const colStart = chartLeft + ci * (colW + COL_GAP);
          const zeroX = colStart + colW * NEG_RATIO;
          return (
            <text
              key={p.key}
              x={zeroX}
              y={TITLE_H + 17}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#4b5563"
            >
              {p.label}
            </text>
          );
        })}

        {/* Rows */}
        {rows.map((row, ri) => {
          const rowY = TITLE_H + HEADER_H + ri * ROW_H;
          const labelY = rowY + ROW_H / 2;

          return (
            <g key={row.id}>
              {/* Row stripe */}
              <rect
                x={chartLeft}
                y={rowY}
                width={chartWidth}
                height={ROW_H}
                fill={ri % 2 === 0 ? "#ffffff" : "#f8f9fb"}
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
                const colStart = chartLeft + ci * (colW + COL_GAP);
                const zeroX = colStart + colW * NEG_RATIO;
                const barY = rowY + (ROW_H - BAR_H) / 2;
                const negArea = colW * NEG_RATIO - 6;
                const posArea = colW * (1 - NEG_RATIO) - 6;

                if (!v.hasData) {
                  return (
                    <g key={p.key}>
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
                  barX = zeroX + 2;
                  pctX = barW > 50 ? zeroX + 2 + barW - 6 : zeroX + 2 + barW + 4;
                  pctAnchor = barW > 50 ? "end" : "start";
                } else {
                  barW = Math.max((absVal / maxVals[ci].neg) * negArea, 3);
                  barX = zeroX - 2 - barW;
                  pctX = barW > 50 ? zeroX - 2 - barW + 6 : zeroX - 2 - barW - 4;
                  pctAnchor = barW > 50 ? "start" : "end";
                }

                return (
                  <g key={p.key}>
                    {/* Zero line */}
                    <line
                      x1={zeroX}
                      y1={rowY + 2}
                      x2={zeroX}
                      y2={rowY + ROW_H - 2}
                      stroke="#d1d5db"
                      strokeWidth={1}
                      strokeDasharray="3,3"
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
