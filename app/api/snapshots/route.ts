import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isValidSnapshotId } from "@/lib/server/snapshot-id";

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  if (date !== null && !isValidSnapshotId(date)) {
    return NextResponse.json(
      { error: "Invalid snapshot id" },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const dir = path.resolve(process.cwd(), "data", "snapshots");

  if (date) {
    const filePath = path.resolve(dir, `${date}.json`);
    if (path.dirname(filePath) !== dir) {
      return NextResponse.json(
        { error: "Invalid snapshot path" },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) {
        return NextResponse.json(
          { error: "Snapshot is unavailable" },
          { status: 500, headers: noStoreHeaders() },
        );
      }

      const content = await fs.readFile(filePath, "utf-8");
      return NextResponse.json(JSON.parse(content), {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (isFileNotFound(error)) {
        return NextResponse.json(null, {
          status: 404,
          headers: noStoreHeaders(),
        });
      }
      return NextResponse.json(
        { error: "Snapshot could not be read" },
        { status: 500, headers: noStoreHeaders() },
      );
    }
  }

  try {
    const files = await fs.readdir(dir);
    const dates = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length))
      .filter(isValidSnapshotId)
      .sort();

    return NextResponse.json(
      { dates, count: dates.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (isFileNotFound(error)) {
      return NextResponse.json(
        { dates: [], count: 0 },
        { headers: noStoreHeaders() },
      );
    }
    return NextResponse.json(
      { error: "Snapshot index could not be read" },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
