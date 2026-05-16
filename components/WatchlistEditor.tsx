"use client";

import type { WatchlistConfig } from "@/lib/types";

interface Props {
  open: boolean;
  sectorIds: string[];
  sectorNames: Record<string, string>;
  sectorCoinCounts: Record<string, number>;
  config: WatchlistConfig;
  onToggle: (sectorId: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function WatchlistEditor({
  open,
  sectorIds,
  sectorNames,
  sectorCoinCounts,
  config,
  onToggle,
  onReset,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 100,
          transition: "opacity 0.2s",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          maxWidth: "90vw",
          background: "#ffffff",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          animation: "slideIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1f2328" }}>
            自选板块
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              color: "#9ca3af",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Sector list */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
          {sectorIds.map((id, i) => {
            const enabled = config.sectors[id]?.enabled !== false;
            return (
              <div
                key={id}
                onClick={() => onToggle(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 20px",
                  cursor: "pointer",
                  background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f5f6f8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc";
                }}
              >
                {/* Toggle */}
                <div
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: enabled ? "#38a169" : "#d1d5db",
                    position: "relative",
                    transition: "background 0.15s",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "#ffffff",
                      position: "absolute",
                      top: 2,
                      left: enabled ? 20 : 2,
                      transition: "left 0.15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>

                <span
                  style={{
                    marginLeft: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    color: enabled ? "#1f2328" : "#d1d5db",
                    transition: "color 0.15s",
                  }}
                >
                  {sectorNames[id] || id}
                </span>

                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: enabled ? "#9ca3af" : "#e5e7eb",
                  }}
                >
                  {sectorCoinCounts[id] || 0} 币
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={onReset}
            style={{
              width: "100%",
              padding: "8px 0",
              background: "#f5f6f8",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 13,
              color: "#6b7280",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            恢复默认
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
