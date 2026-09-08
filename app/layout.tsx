import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radiant Review | VALORANT VOD Coach",
  description:
    "VALORANT録画から30日間のミッションを作成。次の録画でAIが達成を確認し、経験値と成長レベルで改善を追えるVODコーチ。",
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
