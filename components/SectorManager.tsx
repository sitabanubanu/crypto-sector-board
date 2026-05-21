"use client";

import { useState, useMemo } from "react";
import type { SectorsFile, SectorConfig } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  sectorsData: SectorsFile;
  gateInstIds: string[];
  onSaved: () => void;
}

export default function SectorManager({ open, onClose, sectorsData, gateInstIds, onSaved }: Props) {
  const [sectors, setSectors] = useState<SectorConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Init on open
  const init = () => {
    setSectors(JSON.parse(JSON.stringify(sectorsData.sectors)));
    setMessage(null);
  };

  // Add coin to a sector
  const addCoin = (sectorIdx: number, coinId: string) => {
    setSectors((prev) => {
      const next = [...prev];
      const sector = { ...next[sectorIdx], coins: [...next[sectorIdx].coins] };
      if (!sector.coins.includes(coinId)) {
        sector.coins.push(coinId);
      }
      next[sectorIdx] = sector;
      return next;
    });
  };

  // Remove coin from a sector
  const removeCoin = (sectorIdx: number, coinId: string) => {
    setSectors((prev) => {
      const next = [...prev];
      next[sectorIdx] = { ...next[sectorIdx], coins: next[sectorIdx].coins.filter((c) => c !== coinId) };
      return next;
    });
  };

  // Rename sector
  const renameSector = (sectorIdx: number, name: string) => {
    setSectors((prev) => {
      const next = [...prev];
      next[sectorIdx] = { ...next[sectorIdx], name };
      return next;
    });
  };

  // Delete sector
  const deleteSector = (sectorIdx: number) => {
    setSectors((prev) => prev.filter((_, i) => i !== sectorIdx));
  };

  // Add new sector
  const addSector = () => {
    const id = `custom-${Date.now()}`;
    setSectors((prev) => [...prev, { id, name: "新板块", coins: [] }]);
  };

  // Save to API
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sectorsData,
          sectors,
          lastUpdated: new Date().toISOString().split("T")[0],
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage({ type: "ok", text: `已保存${json.mode === "github" ? "（GitHub 提交）" : "（本地文件）"}` });
        onSaved();
      } else {
        setMessage({ type: "err", text: json.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "err", text: "网络错误" });
    }
    setSaving(false);
  };

  // Available coins not yet in any sector
  const usedCoins = useMemo(() => {
    const s = new Set<string>();
    for (const sc of sectors) {
      for (const c of sc.coins) s.add(c);
    }
    return s;
  }, [sectors]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 100,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: "95vw",
          background: "#ffffff",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
        }}
        onClick={() => {
          if (sectors.length === 0) init();
        }}
        onMouseEnter={() => {
          if (sectors.length === 0) init();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1f2328" }}>编辑板块清单</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 18, color: "#9ca3af", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Sector list */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
          {sectors.map((sector, si) => (
            <div
              key={sector.id}
              style={{
                margin: "4px 16px",
                padding: 12,
                background: "#f8f9fb",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            >
              {/* Sector header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  value={sector.name}
                  onChange={(e) => renameSector(si, e.target.value)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: 10, color: "#9ca3af" }}>{sector.coins.length} 币</span>
                <button
                  onClick={() => deleteSector(si)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: "2px 4px",
                  }}
                  title="删除板块"
                >
                  ✕
                </button>
              </div>

              {/* Coin tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {sector.coins.map((coinId) => (
                  <span
                    key={coinId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      background: "#e5e7eb",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  >
                    {coinId}
                    <button
                      onClick={() => removeCoin(si, coinId)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 10,
                        color: "#9ca3af",
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              {/* Add coin selector */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addCoin(si, e.target.value);
                    e.target.value = "";
                  }
                }}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "4px 6px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#6b7280",
                  outline: "none",
                }}
              >
                <option value="">+ 添加币种…</option>
                {gateInstIds
                  .filter((id) => !usedCoins.has(id))
                  .map((id) => (
                    <option key={id} value={id}>
                      {id.replace(/_USDT$/i, "").replace(/-USDT$/i, "")}
                    </option>
                  ))}
              </select>
            </div>
          ))}

          {/* Add sector button */}
          <div style={{ padding: "4px 16px" }}>
            <button
              onClick={addSector}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "#f5f6f8",
                border: "2px dashed #d1d5db",
                borderRadius: 8,
                fontSize: 13,
                color: "#6b7280",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              + 添加板块
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
          {message && (
            <div
              style={{
                fontSize: 11,
                color: message.type === "ok" ? "#38a169" : "#e53e3e",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              {message.text}
            </div>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: "100%",
              padding: "8px 0",
              background: saving ? "#d1d5db" : "#1f2328",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              color: "#fff",
              cursor: saving ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "保存中…" : "保存到 GitHub"}
          </button>
          <div style={{ fontSize: 9, color: "#9ca3af", textAlign: "center", marginTop: 6 }}>
            保存后约 30 秒 Vercel 自动重新部署
          </div>
        </div>
      </div>
    </>
  );
}
