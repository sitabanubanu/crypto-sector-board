import HomeClient from "@/components/HomeClient";
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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f6f8",
        color: "#6b7280",
        fontSize: 14,
      }}
    >
      市场数据暂时不可用，请稍后刷新。
    </div>
  );
}
