import { NextResponse } from "next/server";
import sectorsData from "@/data/sectors.json";

export async function GET() {
  return NextResponse.json(sectorsData, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Sector editing is temporarily disabled until authenticated administration is available.",
    },
    {
      status: 405,
      headers: {
        Allow: "GET",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
