import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン | Radiant Review",
  description: "GoogleまたはXでログインし、分析記録と成長データを引き継ぎます。",
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
