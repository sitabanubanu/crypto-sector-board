import { NextResponse } from "next/server";
import { BoardQuerySchema } from "@/lib/market-data/bff-contracts";
import { getBoardResponse } from "@/lib/server/board-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = BoardQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: "Use a supported period and market_cap weighting.",
        },
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const response = await getBoardResponse();
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error(
      "Board query failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      {
        error: {
          code: "BOARD_UNAVAILABLE",
          message: "The market board is temporarily unavailable.",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
