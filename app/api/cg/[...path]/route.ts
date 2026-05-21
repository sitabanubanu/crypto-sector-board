export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const query = new URL(req.url).search;
  const cgUrl = `https://api.coingecko.com/api/v3/${path.join("/")}${query}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const res = await fetch(cgUrl, { headers });

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
