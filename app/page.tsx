import HomeClient from "@/components/HomeClient";
import UnavailableState from "@/app/UnavailableState";
import { getBoardResponse } from "@/lib/server/board-data";

export const dynamic = "force-dynamic";

async function loadInitialBoard() {
  try {
    return await getBoardResponse();
  } catch (error) {
    console.error(
      "Initial board render failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

export default async function Home() {
  const initialBoard = await loadInitialBoard();
  if (initialBoard) return <HomeClient initialBoard={initialBoard} />;

  return <UnavailableState />;
}
