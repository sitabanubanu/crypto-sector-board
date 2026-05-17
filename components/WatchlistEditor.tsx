"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { WatchlistConfig, CustomSectorConfig } from "@/lib/types";

interface Props {
  open: boolean;
  sectorIds: string[];
  sectorNames: Record<string, string>;
  sectorCoinCounts: Record<string, number>;
  config: WatchlistConfig;
  onToggle: (sectorId: string) => void;
  onReset: () => void;
  onClose: () => void;
  // Custom sector props
  okxInstIds: string[];
  customSectors: CustomSectorConfig[];
  onAddCustomSector: (name: string, coins: string[]) => void;
  onUpdateCustomSector: (id: string, name: string, coins: string[]) => void;
  onDeleteCustomSector: (id: string) => void;
}

type TabKey = "builtin" | "custom";

export default function WatchlistEditor({
  open,
  sectorIds,
  sectorNames,
  sectorCoinCounts,
  config,
  onToggle,
  onReset,
  onClose,
  okxInstIds,
  customSectors,
  onAddCustomSector,
  onUpdateCustomSector,
  onDeleteCustomSector,
}: Props) {
  const [tab, setTab] = useState<TabKey>("builtin");

  // Inline editor state
  const [editingId, setEditingId] = useState<string | null>(null); // null = adding new, string = editing existing
  const [editorName, setEditorName] = useState("");
  const [editorCoins, setEditorCoins] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isEditing = editingId !== null;
  const isAdding = editingId === null && editorCoins.length >= 0;

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toUpperCase();
    return okxInstIds
      .filter((id) => id.toUpperCase().includes(q) && !editorCoins.includes(id))
      .slice(0, 10);
  }, [searchQuery, okxInstIds, editorCoins]);

  // Start adding a new sector
  const startAdd = () => {
    setEditingId(null);
    setEditorName("");
    setEditorCoins([]);
    setSearchQuery("");
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Start editing an existing sector
  const startEdit = (cs: CustomSectorConfig) => {
    setEditingId(cs.id);
    setEditorName(cs.name);
    setEditorCoins([...cs.coins]);
    setSearchQuery("");
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditorName("");
    setEditorCoins([]);
    setSearchQuery("");
  };

  // Save
  const handleSave = () => {
    const name = editorName.trim();
    if (!name || editorCoins.length === 0) return;
    if (editingId) {
      onUpdateCustomSector(editingId, name, editorCoins);
    } else {
      onAddCustomSector(name, editorCoins);
    }
    cancelEdit();
  };

  // Focus search input when editor opens
  useEffect(() => {
    if (editingId !== undefined) {
      searchInputRef.current?.focus();
    }
  }, [editingId]);

  if (!open) return null;

  // Separate built-in vs custom sector IDs
  const customIds = new Set(customSectors.map((cs) => cs.id));
  const builtinIds = sectorIds.filter((id) => !customIds.has(id));

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
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          maxWidth: "92vw",
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
            padding: "14px 20px",
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

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
          <TabButton active={tab === "builtin"} onClick={() => setTab("builtin")}>
            内置板块
          </TabButton>
          <TabButton active={tab === "custom"} onClick={() => setTab("custom")}>
            自定义板块
          </TabButton>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "builtin" && (
            <div style={{ padding: "8px 0" }}>
              {builtinIds.map((id, i) => {
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
                    <ToggleSwitch enabled={enabled} />
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 14,
                        fontWeight: 600,
                        color: enabled ? "#1f2328" : "#d1d5db",
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
              {builtinIds.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  暂无内置板块
                </div>
              )}
            </div>
          )}

          {tab === "custom" && (
            <div style={{ padding: "8px 0" }}>
              {/* Existing custom sectors */}
              {customSectors.map((cs, i) => {
                const enabled = config.sectors[cs.id]?.enabled !== false;
                return (
                  <div
                    key={cs.id}
                    style={{
                      background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                      padding: "12px 20px",
                      borderBottom: "1px solid #f0f1f3",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                      <div
                        onClick={() => onToggle(cs.id)}
                        style={{ cursor: "pointer", flexShrink: 0 }}
                      >
                        <ToggleSwitch enabled={enabled} />
                      </div>
                      <span
                        style={{
                          marginLeft: 10,
                          fontSize: 14,
                          fontWeight: 600,
                          color: enabled ? "#1f2328" : "#d1d5db",
                          flex: 1,
                        }}
                      >
                        {cs.name}
                      </span>
                      <button
                        onClick={() => startEdit(cs)}
                        title="编辑"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "#6b7280",
                          padding: "4px 6px",
                        }}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => onDeleteCustomSector(cs.id)}
                        title="删除"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "#ef4444",
                          padding: "4px 6px",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 40 }}>
                      {cs.coins.map((instId) => (
                        <span
                          key={instId}
                          style={{
                            fontSize: 10,
                            background: enabled ? "#f0f1f3" : "#f9fafb",
                            color: enabled ? "#6b7280" : "#d1d5db",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {instId.replace(/[-_]USDT$/i, "")}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Inline editor */}
              {editingId !== undefined && (
                <div
                  style={{
                    margin: "8px 16px",
                    padding: 16,
                    background: "#f8f9fb",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {/* Name input */}
                  <input
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    placeholder="板块名称"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      marginBottom: 10,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#6b7280";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }}
                  />

                  {/* Search */}
                  <div style={{ position: "relative" }}>
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索币种 (如 BTC, ETH)"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#6b7280";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#d1d5db";
                      }}
                    />
                    {/* Dropdown */}
                    {searchResults.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          zIndex: 10,
                          maxHeight: 200,
                          overflow: "auto",
                        }}
                      >
                        {searchResults.map((instId) => (
                          <div
                            key={instId}
                            onClick={() => {
                              setEditorCoins((prev) => [...prev, instId]);
                              setSearchQuery("");
                            }}
                            style={{
                              padding: "7px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f0f1f3";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#fff";
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{instId.replace(/[-_]USDT$/i, "")}</span>
                            <span style={{ color: "#9ca3af", fontSize: 10 }}>{instId}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected coins */}
                  {editorCoins.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 10,
                      }}
                    >
                      {editorCoins.map((instId) => (
                        <span
                          key={instId}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "#e5e7eb",
                            borderRadius: 4,
                            padding: "3px 8px",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          {instId.replace(/[-_]USDT$/i, "")}
                          <button
                            onClick={() =>
                              setEditorCoins((prev) => prev.filter((c) => c !== instId))
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 12,
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
                  )}

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        fontSize: 12,
                        cursor: "pointer",
                        color: "#6b7280",
                      }}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!editorName.trim() || editorCoins.length === 0}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background:
                          !editorName.trim() || editorCoins.length === 0
                            ? "#d1d5db"
                            : "#1f2328",
                        color: "#fff",
                        fontSize: 12,
                        cursor:
                          !editorName.trim() || editorCoins.length === 0
                            ? "default"
                            : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {editingId ? "保存修改" : "创建板块"}
                    </button>
                  </div>
                </div>
              )}

              {/* Add button */}
              {editingId === undefined && (
                <div style={{ padding: "8px 16px" }}>
                  <button
                    onClick={startAdd}
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
                    + 添加自定义板块
                  </button>
                </div>
              )}
            </div>
          )}
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

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  return (
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
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 0",
        fontSize: 13,
        fontWeight: 600,
        border: "none",
        borderBottom: active ? "2px solid #1f2328" : "2px solid transparent",
        background: "none",
        color: active ? "#1f2328" : "#9ca3af",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}
