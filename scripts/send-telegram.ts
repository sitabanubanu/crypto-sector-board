// Reads latest snapshot and sends hourly summary via Telegram Bot API.
// Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Usage: npx tsx scripts/send-telegram.ts

import * as fs from "fs";
import * as path from "path";
import type { DailySnapshot } from "../lib/types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.log("Telegram secrets not set — skipping.");
  process.exit(0);
}

function loadLatestSnapshot(): DailySnapshot | null {
  const dir = path.join(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  const content = fs.readFileSync(path.join(dir, files[0]), "utf-8");
  return JSON.parse(content) as DailySnapshot;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function formatMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toFixed(0)}`;
}

const snapshot = loadLatestSnapshot();
if (!snapshot) {
  console.log("No snapshot found — skipping.");
  process.exit(0);
}

// Sort sectors by 24h return
const sorted = [...snapshot.sectors].sort(
  (a, b) => b.weightedReturnPct - a.weightedReturnPct
);

const top5 = sorted.slice(0, 5);
const bottom3 = sorted.slice(-3).reverse();

const EM = { strong_up: "🔥", strong_down: "❄️", pullback: "💰", bull_trap: "⚠️" };

// Detect signals
function detectSignal(s: typeof sorted[0]): string | null {
  const r24 = s.weightedReturnPct;
  const r3 = s.weightedReturnPct3d;
  const r7 = s.weightedReturnPct7d;
  const r30 = s.weightedReturnPct30d;
  const allUp = r24 > 0 && (r3 == null || r3 > 0) && (r7 == null || r7 > 0) && (r30 == null || r30 > 0);
  const allDown = r24 < 0 && (r3 == null || r3 < 0) && (r7 == null || r7 < 0) && (r30 == null || r30 < 0);
  if (allUp) return "🔥 强势";
  if (allDown) return "❄️ 弱势";
  if (r24 < 0 && r3 != null && r3 > 0 && r7 != null && r7 > 0) return "💰 回调机会";
  if (r24 > 0 && r3 != null && r3 < 0 && r7 != null && r7 < 0) return "⚠️ 诱多陷阱";
  return null;
}

const signaled = sorted.filter((s) => detectSignal(s) != null);

// Build message
const dateStr = snapshot.date;
const genTime = new Date(snapshot.generatedAt).toLocaleString("zh-CN", { timeZone: "UTC" }) + " UTC";

let msg = `📊 加密板块强弱快报\n`;
msg += `━━━━━━━━━━━━━━━━\n`;
msg += `📅 ${dateStr} · ${genTime}\n`;
msg += `📈 共 ${snapshot.sectors.length} 板块\n\n`;

msg += `🟢 涨幅 Top 5：\n`;
for (const s of top5) {
  msg += `  ${formatPct(s.weightedReturnPct)}  ${s.name}\n`;
}

msg += `\n🔴 跌幅 Bottom 3：\n`;
for (const s of bottom3) {
  msg += `  ${formatPct(s.weightedReturnPct)}  ${s.name}\n`;
}

// Active signals
if (signaled.length > 0) {
  msg += `\n⚡ 活跃信号：\n`;
  for (const s of signaled) {
    const signal = detectSignal(s);
    msg += `  ${signal}  ${s.name}\n`;
  }
}

// Special: BTC spotlight
const btc = sorted.find((s) => s.id === "btc");
if (btc) {
  msg += `\n🪙 BTC：${formatPct(btc.weightedReturnPct)}`;
  if (btc.totalVolume24h) msg += ` · 成交量 ${formatMarketCap(btc.totalVolume24h)}`;
}

msg += `\n\n━━━━━━━━━━━━━━━━\n`;
msg += `🔗 完整面板：${process.env.VERCEL_URL || "(部署地址)"}`;

// Send
const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const body = JSON.stringify({
  chat_id: CHAT_ID,
  text: msg,
  parse_mode: "HTML",
  disable_web_page_preview: true,
});

(async () => {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const result = await res.json();
  if (!result.ok) {
    console.error("Telegram send failed:", result);
    process.exit(1);
  }
  console.log("Telegram message sent.");
})();
