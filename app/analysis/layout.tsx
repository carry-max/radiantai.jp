import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "録画分析 | Radiant Review",
  description: "VALORANT録画からデス原因、AIM、ラウンド全体を分析し、次に直す行動を確認します。",
};

export default function AnalysisLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
