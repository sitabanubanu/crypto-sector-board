import * as fs from "fs";
import * as path from "path";
import type { DailySnapshot } from "./types";

export function loadLatestSnapshot(): DailySnapshot | null {
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
