import { NextResponse } from "next/server";
import { CandlesQuerySchema } from "@/lib/market-data/bff-contracts";
import {
  getCandlesResponse,
  PublicDataQueryError,
} from "@/lib/server/market-history-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = CandlesQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_QUERY",
          message:
            "Use a tracked asset, 1h timeframe, and a bounded ISO date range.",
        },
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const response = await getCandlesResponse(parsed.data);
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const isQueryError = error instanceof PublicDataQueryError;
    if (!isQueryError) {
      console.error(
        "Candle query failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return NextResponse.json(
      {
        error: {
          code: isQueryError ? error.code : "CANDLES_UNAVAILABLE",
          message: isQueryError
            ? error.message
            : "Candle data is temporarily unavailable.",
        },
      },
      {
        status: isQueryError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
