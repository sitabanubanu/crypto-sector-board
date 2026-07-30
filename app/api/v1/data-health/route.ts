import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { getDataHealthReport } from "@/lib/ingestion/data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getDataHealthReport(getDatabase());
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "Data health query failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      {
        error: {
          code: "DATA_HEALTH_UNAVAILABLE",
          message: "Data health is temporarily unavailable.",
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
