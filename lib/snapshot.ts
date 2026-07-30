import * as fs from "fs";
import * as path from "path";
import type { DailySnapshot } from "./types";
import { parseDailySnapshot } from "./market-data/snapshot-schema";

export function loadLatestSnapshot(
  snapshotsDir = path.join(process.cwd(), "data", "snapshots"),
): DailySnapshot | null {
  if (!fs.existsSync(snapshotsDir)) return null;
  const files = fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files) {
    const filePath = path.join(snapshotsDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return parseDailySnapshot(JSON.parse(content));
    } catch (error) {
      console.warn(
        `Ignoring invalid snapshot ${file}:`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  return null;
}
