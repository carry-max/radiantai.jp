import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "成長ダッシュボード | Radiant Review",
  description: "立ち回りとAIMの成長グラフ、30日ミッション、次の課題を確認します。",
};

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
