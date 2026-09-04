import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radiant Review | VALORANT VOD Coach",
  description:
    "VALORANT録画のデス地点をブラウザ内で自動検出し、全ユーザーが試合比較や苦手傾向まで確認できるVODコーチ。",
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
