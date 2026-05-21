import { NextResponse } from "next/server";
import { loadLatestSnapshot } from "@/lib/snapshot";
import * as fs from "fs";
import * as path from "path";
import type { DailySnapshot } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  const dir = path.join(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ snapshots: [] });
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (date) {
    // Return specific snapshot
    const filePath = path.join(dir, `${date}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return NextResponse.json(JSON.parse(content));
    }
    return NextResponse.json(null, { status: 404 });
  }

  // Return list of available dates
  const dates = files.map((f) => f.replace(".json", ""));
  return NextResponse.json({ dates, count: dates.length });
}
