// Legacy manual sender. P5.1 deliberately omits signals because the correct
// rank/anomaly rules require timestamped history. P5.4 will connect this script
// to the shared market-pulse domain module before enabling a workflow.
// Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Usage: npx tsx scripts/send-telegram.ts

import { loadLatestSnapshot } from "../lib/snapshot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.log("Telegram secrets not set — skipping.");
  process.exit(0);
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function formatMarketCap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
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
  (a, b) =>
    (b.weightedReturnPct ?? Number.NEGATIVE_INFINITY) -
    (a.weightedReturnPct ?? Number.NEGATIVE_INFINITY),
);

const top5 = sorted.slice(0, 5);
const bottom3 = sorted.slice(-3).reverse();

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
