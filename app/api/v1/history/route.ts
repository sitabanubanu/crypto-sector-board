import { NextResponse } from "next/server";
import { HistoryQuerySchema } from "@/lib/market-data/bff-contracts";
import {
  getHistoryResponse,
  PublicDataQueryError,
} from "@/lib/server/market-history-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = HistoryQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: "Provide a comma-separated assetIds list and 2-31 days.",
        },
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const response = await getHistoryResponse(
      parsed.data.assetIds.split(",").map((assetId) => assetId.trim()),
      parsed.data.days,
    );
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const isQueryError = error instanceof PublicDataQueryError;
    if (!isQueryError) {
      console.error(
        "History query failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return NextResponse.json(
      {
        error: {
          code: isQueryError ? error.code : "HISTORY_UNAVAILABLE",
          message: isQueryError
            ? error.message
            : "History data is temporarily unavailable.",
        },
      },
      {
        status: isQueryError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
