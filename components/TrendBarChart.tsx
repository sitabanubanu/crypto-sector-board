"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SectorSnapshot } from "@/lib/types";
import { getSectorReturn, hasSectorReturnForPeriod, sectorColorForPeriod, formatPct } from "@/lib/colors";
import type { SectorSignal } from "@/lib/signals";

interface Props {
  sectors: SectorSnapshot[];
  signals?: Map<string, SectorSignal>;
  totalVolume?: number;
  isMobile?: boolean;
}

const PERIODS = [
  { key: "24h" as const, label: "24h" },
  { key: "3d" as const, label: "3d" },
  { key: "7d" as const, label: "7d" },
  { key: "30d" as const, label: "30d" },
];

export default function TrendBarChart({ sectors, signals, totalVolume, isMobile }: Props) {
  const ROW_H = isMobile ? 30 : 34;
  const BAR_H = isMobile ? 14 : 18;
  const LABEL_W = isMobile ? 76 : 110;
  const PAD = isMobile ? 6 : 8;
  const HEADER_H = isMobile ? 24 : 28;
  const TITLE_H = isMobile ? 24 : 32;
  const FOOTER_H = isMobile ? 28 : 36;
  const COL_GAP = isMobile ? 0 : 1;
  const SIGNAL_W = isMobile ? 26 : 36;

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
      volume24h: s.totalVolume24h,
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

  const chartStart = LABEL_W + PAD;
  const chartEnd = width - PAD - SIGNAL_W;
  const chartWidth = chartEnd - chartStart;
  const n = PERIODS.length;
  const colW = width > 0 ? Math.max((chartWidth - COL_GAP * (n - 1)) / n, 50) : 50;
  const NEG_RATIO = 0.4;

  const maxVals = PERIODS.map((p) => {
    const vals = rows
      .map((r) => r.values.find((v) => v.key === p.key)!)
      .filter((v) => v.hasData);
    const pos = Math.max(...vals.map((v) => Math.max(v.value, 0)), 0.005);
    const neg = Math.max(...vals.map((v) => Math.max(-v.value, 0)), 0.005);
    return { pos, neg };
  });

  // Volume dot scale
  const maxSectorVol = rows.reduce((max, r) => Math.max(max, r.volume24h ?? 0), 0);
  const volDotMaxR = 5;
  const volDotMinR = 1.5;

  // Debug: count sectors with 3d data and show their returns
  const sectorsWith3d = rows.filter((r) => r.values[1]?.hasData);
  const sectorsWithout3d = rows.filter((r) => !r.values[1]?.hasData);
  const zero3dSectors = sectorsWith3d.filter((r) => Math.abs(r.values[1].value) < 0.0001);

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
        <text x={PAD} y={isMobile ? 16 : 20} fontSize={isMobile ? 10 : 12} fontWeight={600} fill="#1f2328">
          {isMobile ? "板块对比" : "多时间维度板块对比"}
        </text>

        {/* Unified panel background */}
        <rect
          x={chartStart}
          y={TITLE_H}
          width={chartWidth + SIGNAL_W}
          height={HEADER_H + rows.length * ROW_H}
          fill="#fafbfc"
          stroke="#e5e7eb"
          strokeWidth={1}
          rx={4}
        />

        {/* Column dividers */}
        {PERIODS.map((p, ci) => {
          if (ci === 0) return null;
          const divX = chartStart + ci * colW + (ci - 1) * COL_GAP + COL_GAP / 2;
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
        {/* Signal divider */}
        <line
          x1={chartEnd}
          y1={TITLE_H}
          x2={chartEnd}
          y2={TITLE_H + HEADER_H + rows.length * ROW_H}
          stroke="#e5e7eb"
          strokeWidth={1}
        />

        {/* Header row background */}
        <rect x={chartStart} y={TITLE_H} width={chartWidth + SIGNAL_W} height={HEADER_H} fill="#f0f1f3" rx={4} />
        <rect x={chartStart} y={TITLE_H + HEADER_H - 4} width={chartWidth + SIGNAL_W} height={4} fill="#f0f1f3" />

        {/* Column headers */}
        {PERIODS.map((p, ci) => {
          const colStart = chartStart + ci * (colW + COL_GAP);
          const zeroX = colStart + colW * NEG_RATIO;
          return (
            <text
              key={p.key}
              x={zeroX}
              y={TITLE_H + HEADER_H / 2 + 4}
              textAnchor="middle"
              fontSize={isMobile ? 9 : 10}
              fontWeight={600}
              fill="#4b5563"
            >
              {p.label}
            </text>
          );
        })}
        {/* Signal header */}
        <text
          x={chartEnd + SIGNAL_W / 2}
          y={TITLE_H + HEADER_H / 2 + 4}
          textAnchor="middle"
          fontSize={isMobile ? 9 : 10}
          fontWeight={600}
          fill="#9ca3af"
        >
          {isMobile ? "" : "信号"}
        </text>

        {/* Rows */}
        {rows.map((row, ri) => {
          const rowY = TITLE_H + HEADER_H + ri * ROW_H;
          const labelY = rowY + ROW_H / 2;

          return (
            <g key={row.id}>
              {/* Row stripe */}
              <rect
                x={chartStart}
                y={rowY}
                width={chartWidth + SIGNAL_W}
                height={ROW_H}
                fill={ri % 2 === 0 ? "#ffffff" : "#f8f9fb"}
              />

              {/* Sector name */}
              <text
                x={LABEL_W - 4}
                y={labelY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={isMobile ? 11 : 12}
                fontWeight={600}
                fill="#1f2328"
              >
                {row.name}
              </text>

              {/* Volume dot */}
              {row.volume24h != null && row.volume24h > 0 && maxSectorVol > 0 && (
                <circle
                  cx={LABEL_W + 2}
                  cy={labelY}
                  r={volDotMinR + (row.volume24h / maxSectorVol) * (volDotMaxR - volDotMinR)}
                  fill="#9ca3af"
                  opacity={0.5}
                />
              )}

              {/* Four period columns */}
              {PERIODS.map((p, ci) => {
                const v = row.values[ci];
                const colStart = chartStart + ci * (colW + COL_GAP);
                const zeroX = colStart + colW * NEG_RATIO;
                const barY = rowY + (ROW_H - BAR_H) / 2;
                const negArea = colW * NEG_RATIO - 4;
                const posArea = colW * (1 - NEG_RATIO) - 4;

                if (!v.hasData) {
                  return (
                    <g key={p.key}>
                      <text
                        x={zeroX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={isMobile ? 9 : 10}
                        fill="#d1d5db"
                      >
                        --
                      </text>
                    </g>
                  );
                }

                const barColor = sectorColorForPeriod(
                  sectors.find((s) => s.id === row.id)!,
                  p.key,
                );
                const absVal = Math.abs(v.value);
                let barX: number;
                let barW: number;
                let pctX: number;
                let pctAnchor: "start" | "end";

                if (v.value >= 0) {
                  barW = Math.max((absVal / maxVals[ci].pos) * posArea, absVal === 0 ? 0 : 2);
                  barX = zeroX + 2;
                  pctX = barW > 44 ? zeroX + 2 + barW - 4 : zeroX + 2 + barW + 3;
                  pctAnchor = barW > 44 ? "end" : "start";
                } else {
                  barW = Math.max((absVal / maxVals[ci].neg) * negArea, 2);
                  barX = zeroX - 2 - barW;
                  pctX = barW > 44 ? zeroX - 2 - barW + 4 : zeroX - 2 - barW - 3;
                  pctAnchor = barW > 44 ? "start" : "end";
                }

                return (
                  <g key={p.key}>
                    <line
                      x1={zeroX}
                      y1={rowY + 2}
                      x2={zeroX}
                      y2={rowY + ROW_H - 2}
                      stroke="#d1d5db"
                      strokeWidth={1}
                      strokeDasharray="3,3"
                    />
                    <rect
                      x={barX}
                      y={barY}
                      width={barW || 0}
                      height={BAR_H}
                      fill={barColor}
                      rx={2}
                      ry={2}
                    />
                    <text
                      x={pctX}
                      y={labelY}
                      textAnchor={pctAnchor}
                      dominantBaseline="middle"
                      fontSize={isMobile ? 9 : 10}
                      fontWeight={600}
                      fill={barColor}
                    >
                      {formatPct(v.value)}
                    </text>
                  </g>
                );
              })}

              {/* Signal icon */}
              {signals && signals.has(row.id) && (
                <text
                  x={chartEnd + SIGNAL_W / 2}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isMobile ? 12 : 14}
                >
                  {signals.get(row.id)!.icon}
                </text>
              )}
            </g>
          );
        })}

        {/* Usage footer */}
        <text x={PAD} y={chartH - 12} fontSize={isMobile ? 8 : 10} fill="#9ca3af">
          {isMobile
            ? `3d有=${sectorsWith3d.length} 无=${sectorsWithout3d.length} 近0=${zero3dSectors.map((r) => r.name).join(",")}`
            : `3d有数据=${sectorsWith3d.length} 无数据=${sectorsWithout3d.length} | 近零板块: ${zero3dSectors.map((r) => r.name + "=" + formatPct(r.values[1].value)).join(" ") || "无"} | 🔥💰⚠️❄️`}
        </text>
      </svg>
    </div>
  );
}
