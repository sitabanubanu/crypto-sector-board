"use client";

import { useState } from "react";

export default function UnavailableState() {
  const [reloading, setReloading] = useState(false);

  return (
    <main
      role="alert"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f5f6f8",
        color: "#475569",
        fontSize: 14,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <h1 style={{ margin: 0, color: "#1f2328", fontSize: 20 }}>
          市场数据暂时不可用
        </h1>
        <p style={{ lineHeight: 1.6, margin: "10px 0 16px" }}>
          数据服务没有返回可用结果，请稍后重试。
        </p>
        <button
          type="button"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            window.location.reload();
          }}
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            padding: "8px 16px",
            background: "#ffffff",
            color: "#1f2937",
            cursor: reloading ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {reloading ? "刷新中…" : "重新加载"}
        </button>
      </div>
    </main>
  );
}
