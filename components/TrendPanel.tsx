"use client";

import { useMemo } from "react";
import type { SectorSnapshot } from "@/lib/types";
import { returnPctToColor, textColorOnBlock, formatPct } from "@/lib/colors";

interface Props {
  sectors: SectorSnapshot[];
}

interface RowData {
  id: string;
  name: string;
  ret24h: number;
  ret7d: number;
  ret30d: number;
  has7d: boolean;
  has30d: boolean;
}

const COLUMNS = [
  { key: "ret24h" as const, label: "24h" },
  { key: "ret7d" as const, label: "7d" },
  { key: "ret30d" as const, label: "30d" },
];

export default function TrendPanel({ sectors }: Props) {
  const rows = useMemo(() => {
    const data: RowData[] = sectors.map((s) => ({
      id: s.id,
      name: s.name,
      ret24h: s.weightedReturnPct,
      ret7d: s.weightedReturnPct7d ?? 0,
      ret30d: s.weightedReturnPct30d ?? 0,
      has7d: s.weightedReturnPct7d != null,
      has30d: s.weightedReturnPct30d != null,
    }));
    data.sort((a, b) => b.ret24h - a.ret24h);
    return data;
  }, [sectors]);

  if (rows.length === 0) return null;

  return (
    <div
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

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "4px 12px",
                fontWeight: 500,
                color: "#9ca3af",
                fontSize: 10,
                width: "35%",
              }}
            >
              板块
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "center",
                  padding: "4px 6px",
                  fontWeight: 500,
                  color: "#9ca3af",
                  fontSize: 10,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              style={{
                background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
              }}
            >
              <td
                style={{
                  padding: "5px 12px",
                  fontWeight: 600,
                  color: "#1f2328",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.name}
              </td>
              {COLUMNS.map((col) => {
                const pct = row[col.key];
                const hasData =
                  col.key === "ret24h" ? true : col.key === "ret7d" ? row.has7d : row.has30d;
                if (!hasData) {
                  return (
                    <td
                      key={col.key}
                      style={{
                        textAlign: "center",
                        padding: "5px 6px",
                        color: "#d1d5db",
                        fontSize: 11,
                      }}
                    >
                      --
                    </td>
                  );
                }
                const bg = returnPctToColor(pct);
                const textColor = textColorOnBlock(pct);
                return (
                  <td key={col.key} style={{ padding: "3px 4px" }}>
                    <div
                      style={{
                        background: bg,
                        color: textColor,
                        borderRadius: 4,
                        padding: "3px 6px",
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {formatPct(pct)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
