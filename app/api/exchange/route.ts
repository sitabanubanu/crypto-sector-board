import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { loadLatestSnapshot } from "@/lib/snapshot";
import { fetchOkxSpotTickers, buildSnapshotFromOkx } from "@/lib/okx";
import type { SectorsFile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Read sectors config
    const sectorsPath = path.join(process.cwd(), "data", "sectors.json");
    const sectorsFile: SectorsFile = JSON.parse(fs.readFileSync(sectorsPath, "utf-8"));

    // Get fallback snapshot for 7d/30d + marketCap
    const fallback = loadLatestSnapshot();
    if (!fallback) {
      return NextResponse.json(
        { error: "No snapshot data available" },
        { status: 503 },
      );
    }

    // Fetch live OKX data
    const okxData = await fetchOkxSpotTickers();

    // Build merged snapshot
    const snapshot = buildSnapshotFromOkx(sectorsFile.sectors, okxData, fallback);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, max-age=5, s-maxage=5",
      },
    });
  } catch (err) {
    console.error("Exchange API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch exchange data" },
      { status: 502 },
    );
  }
}
