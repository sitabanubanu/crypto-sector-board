export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const query = new URL(req.url).search;
  const cgUrl = `https://api.coingecko.com/api/v3/${path.join("/")}${query}`;

  const res = await fetch(cgUrl, {
    headers: { "Content-Type": "application/json" },
  });

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
