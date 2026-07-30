"use client";

import { useState, useMemo, useRef, useEffect, useReducer } from "react";
import type { WatchlistConfig, CustomSectorConfig } from "@/lib/types";
import type { PublicAsset } from "@/lib/market-data/bff-contracts";
import {
  createCustomSectorEditorState,
  customSectorEditorReducer,
} from "@/lib/watchlist-editor";

interface Props {
  open: boolean;
  sectorIds: string[];
  sectorNames: Record<string, string>;
  sectorCoinCounts: Record<string, number>;
  config: WatchlistConfig;
  onToggle: (sectorId: string) => void;
  onReset: () => void;
  onClose: () => void;
  assets: PublicAsset[];
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
  assets,
  customSectors,
  onAddCustomSector,
  onUpdateCustomSector,
  onDeleteCustomSector,
}: Props) {
  const [tab, setTab] = useState<TabKey>("builtin");

  const [editor, dispatchEditor] = useReducer(
    customSectorEditorReducer,
    undefined,
    createCustomSectorEditorState,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.assetId, asset])),
    [assets],
  );

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!editor.query.trim()) return [];
    const q = editor.query.trim().toLowerCase();
    return assets
      .filter(
        (asset) =>
          !editor.coins.includes(asset.assetId) &&
          [asset.assetId, asset.symbol, asset.name].some((value) =>
            value.toLowerCase().includes(q),
          ),
      )
      .slice(0, 10);
  }, [assets, editor.query, editor.coins]);

  // Start adding a new sector
  const startAdd = () => {
    dispatchEditor({ type: "start_add" });
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Start editing an existing sector
  const startEdit = (cs: CustomSectorConfig) => {
    dispatchEditor({ type: "start_edit", sector: cs });
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Cancel editing
  const cancelEdit = () => {
    dispatchEditor({ type: "close" });
  };

  // Save
  const handleSave = () => {
    const name = editor.name.trim();
    if (!name || editor.coins.length === 0) return;
    if (editor.mode.kind === "editing") {
      onUpdateCustomSector(editor.mode.sectorId, name, editor.coins);
    } else if (editor.mode.kind === "adding") {
      onAddCustomSector(name, editor.coins);
    }
    cancelEdit();
  };

  // Focus search input when editor opens
  useEffect(() => {
    if (editor.mode.kind !== "closed") {
      searchInputRef.current?.focus();
    }
  }, [editor.mode]);

  useEffect(() => {
    if (!open) dispatchEditor({ type: "close" });
  }, [open]);

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
                      {cs.coins.map((assetId) => (
                        <span
                          key={assetId}
                          style={{
                            fontSize: 10,
                            background: enabled ? "#f0f1f3" : "#f9fafb",
                            color: enabled ? "#6b7280" : "#d1d5db",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {assetsById.get(assetId)?.symbol ?? assetId}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Inline editor */}
              {editor.mode.kind !== "closed" && (
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
                    value={editor.name}
                    onChange={(e) =>
                      dispatchEditor({ type: "set_name", name: e.target.value })
                    }
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
                      value={editor.query}
                      onChange={(e) =>
                        dispatchEditor({ type: "set_query", query: e.target.value })
                      }
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
                        {searchResults.map((asset) => (
                          <div
                            key={asset.assetId}
                            onClick={() => {
                              dispatchEditor({
                                type: "add_coin",
                                assetId: asset.assetId,
                              });
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
                            <span style={{ fontWeight: 600 }}>
                              {asset.symbol} · {asset.name}
                            </span>
                            <span style={{ color: "#9ca3af", fontSize: 10 }}>
                              {asset.assetId}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected coins */}
                  {editor.coins.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 10,
                      }}
                    >
                      {editor.coins.map((assetId) => (
                        <span
                          key={assetId}
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
                          {assetsById.get(assetId)?.symbol ?? assetId}
                          <button
                            onClick={() =>
                              dispatchEditor({
                                type: "remove_coin",
                                assetId,
                              })
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
                      disabled={!editor.name.trim() || editor.coins.length === 0}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background:
                          !editor.name.trim() || editor.coins.length === 0
                            ? "#d1d5db"
                            : "#1f2328",
                        color: "#fff",
                        fontSize: 12,
                        cursor:
                          !editor.name.trim() || editor.coins.length === 0
                            ? "default"
                            : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {editor.mode.kind === "editing" ? "保存修改" : "创建板块"}
                    </button>
                  </div>
                </div>
              )}

              {/* Add button */}
              {editor.mode.kind === "closed" && (
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
            onClick={() => {
              if (window.confirm("恢复默认会删除全部自定义板块，确定继续吗？")) {
                onReset();
                dispatchEditor({ type: "close" });
              }
            }}
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
