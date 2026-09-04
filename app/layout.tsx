import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radiant Review | VALORANT VOD Coach",
  description:
    "VALORANT録画を自動解析し、次の録画で反省ミッションの達成をAI判定。成長レベルとXPで改善を追えるVODコーチ。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
