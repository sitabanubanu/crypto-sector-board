"use client";

import { useState } from "react";
import type { CorrelationMatrix } from "@/lib/correlation";

interface Props {
  matrix: CorrelationMatrix | null;
  isMobile: boolean;
}

function corrColor(r: number): string {
  // Dark red for high positive, white for zero, dark green for high negative
  const abs = Math.abs(r);
  if (r >= 0) {
    if (abs < 0.2) return "#f5f6f8";
    if (abs < 0.4) return "#fed7d7";
    if (abs < 0.6) return "#fc8181";
    if (abs < 0.8) return "#e53e3e";
    return "#c81e1e";
  } else {
    if (abs < 0.2) return "#f5f6f8";
    if (abs < 0.4) return "#c6f6d5";
    if (abs < 0.6) return "#68d391";
    if (abs < 0.8) return "#38a169";
    return "#22543d";
  }
}

function textColorForCorr(r: number): string {
  return Math.abs(r) >= 0.5 ? "#ffffff" : "#1f2328";
}

export default function CorrelationHeatmap({ matrix, isMobile }: Props) {
  const [open, setOpen] = useState(false);

  const n = matrix?.sectorIds.length ?? 0;
  const cellSize = isMobile ? 22 : 28;
  const labelW = isMobile ? 60 : 80;
  const pad = 4;
  const svgW = labelW + n * cellSize + pad;
  const svgH = 24 + n * cellSize + pad;
  const hasData = matrix != null && n > 0;

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          right: 12,
          bottom: 64,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: hasData ? "#6b7280" : "#d1d5db",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          zIndex: 10,
        }}
        title="板块相关性热力图"
      >
        ⊞ 相关性
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.15)",
              zIndex: 98,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              zIndex: 99,
              padding: "16px 20px",
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1f2328" }}>
                板块相关性矩阵
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "#9ca3af",
                }}
              >
                ✕
              </button>
            </div>

            {!hasData ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
                等待 30 天 K 线数据加载…
                <br />
                <span style={{ fontSize: 10 }}>（需要 Gate.io 实时连接成功后自动计算）</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                  基于近 30 天日收益率计算 · Pearson 相关系数 · 红=正相关 绿=负相关
                </div>
                <svg width={svgW} height={svgH} style={{ display: "block" }}>
                  {/* Column labels */}
                  {matrix.sectorNames.map((name, i) => (
                    <text
                      key={`col-${i}`}
                      x={labelW + i * cellSize + cellSize / 2}
                      y={12}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#6b7280"
                      transform={`rotate(-45, ${labelW + i * cellSize + cellSize / 2}, 12)`}
                    >
                      {name.length > 6 ? name.slice(0, 5) + "…" : name}
                    </text>
                  ))}
                  {/* Rows */}
                  {matrix.sectorNames.map((name, i) => (
                    <g key={`row-${i}`}>
                      <text
                        x={labelW - 4}
                        y={24 + i * cellSize + cellSize / 2 + 2}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontSize={9}
                        fontWeight={600}
                        fill="#4b5563"
                      >
                        {name.length > 6 ? name.slice(0, 5) + "…" : name}
                      </text>
                      {matrix.matrix[i].map((val, j) => (
                        <g key={`cell-${i}-${j}`}>
                          <rect
                            x={labelW + j * cellSize}
                            y={24 + i * cellSize}
                            width={cellSize - 1}
                            height={cellSize - 1}
                            fill={corrColor(val)}
                            rx={2}
                          />
                          <text
                            x={labelW + j * cellSize + cellSize / 2}
                            y={24 + i * cellSize + cellSize / 2 + 1}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={9}
                            fontWeight={i === j ? 700 : 500}
                            fill={textColorForCorr(val)}
                          >
                            {i === j ? "·" : (val * 100).toFixed(0)}
                          </text>
                        </g>
                      ))}
                    </g>
                  ))}
                </svg>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    color: "#9ca3af",
                    lineHeight: 1.6,
                  }}
                >
                  提示：相关性 &gt; 0.7 的板块同涨同跌，分散持仓时尽量避开高度相关的板块组合
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
