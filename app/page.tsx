import HomeClient from "@/components/HomeClient";
import { loadLatestSnapshot } from "@/lib/snapshot";

export const dynamic = "force-static";

export default function Home() {
  const snapshot = loadLatestSnapshot();

  if (!snapshot) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f6f8",
          color: "#6b7280",
          fontSize: 14,
        }}
      >
        暂无数据。请先运行 <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>npm run fetch-snapshot</code>
      </div>
    );
  }

  return <HomeClient snapshot={snapshot} />;
}
