import * as fs from "fs";
import * as path from "path";
import HomeClient from "@/components/HomeClient";
import type { DailySnapshot } from "@/lib/types";

export const dynamic = "force-static";

function loadLatestSnapshot(): DailySnapshot | null {
  const snapshotsDir = path.join(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(snapshotsDir)) return null;

  const files = fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const filePath = path.join(snapshotsDir, files[0]);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as DailySnapshot;
}

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
