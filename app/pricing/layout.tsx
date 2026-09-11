import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金 | Radiant Review",
  description: "ReviewとClimbの料金、解析回数、支払い方法を確認します。",
};

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
