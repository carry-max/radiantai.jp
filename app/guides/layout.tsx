import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VALORANT教材 | Radiant Review",
  description: "日本人プレイヤーの動画から、AIM、クロスヘアプレイスメント、ピーク、立ち回りを学習順に紹介します。",
};

export default function GuidesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
