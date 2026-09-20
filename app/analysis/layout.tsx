import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "立ち回り・ミクロ分析 | Radiant Review",
  description: "Riot APIの試合データとOverwolfの自動デスクリップから、VALORANTの立ち回り・ミクロ・Deepを分析します。",
};

export default function AnalysisLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
