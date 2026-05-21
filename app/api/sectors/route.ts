import { NextResponse } from "next/server";
import sectorsData from "@/data/sectors.json";
import type { SectorsFile } from "@/lib/types";

export async function GET() {
  return NextResponse.json(sectorsData);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SectorsFile;
    const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;

    if (!token) {
      // Local dev fallback: write to filesystem
      try {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.join(process.cwd(), "data", "sectors.json");
        fs.writeFileSync(filePath, JSON.stringify(body, null, 2) + "\n", "utf-8");
        return NextResponse.json({ ok: true, mode: "local" });
      } catch {
        return NextResponse.json(
          { error: "GITHUB_TOKEN not set. Set it in Vercel env vars or .env.local" },
          { status: 500 },
        );
      }
    }

    // Production: commit via GitHub API
    const content = Buffer.from(JSON.stringify(body, null, 2) + "\n").toString("base64");

    // Get current file SHA
    const getUrl = `https://api.github.com/repos/sitabanubanu/crypto-sector-board/contents/data/sectors.json`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const getJson = await getRes.json();
    const sha = getJson.sha;

    // Update file
    const putUrl = getUrl;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "网页端更新板块清单",
        content,
        sha,
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return NextResponse.json({ error: err.message || "GitHub API failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: "github" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
