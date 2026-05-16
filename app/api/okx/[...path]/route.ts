export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const query = new URL(req.url).search;
  const okxUrl = `https://www.okx.com/api/v5/${path.join("/")}${query}`;

  const res = await fetch(okxUrl, {
    headers: { "Content-Type": "application/json" },
  });

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
    },
  });
}
