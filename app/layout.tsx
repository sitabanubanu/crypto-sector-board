import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "加密板块强弱看板",
  description: "每日 UTC 0 点抓取主流加密板块行情，用 Treemap 一眼看板块强弱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
