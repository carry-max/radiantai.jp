"use client";

import { Activity, Crosshair, LayoutDashboard, Wallet } from "lucide-react";
import { AccountLink } from "@/components/account-provider";
import Link from "next/link";

export function SiteHeader({ current }: { current?: "home" | "dashboard" | "analysis" | "pricing" }) {
  const links = [
    { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard, id: "dashboard" },
    { href: "/analysis", label: "分析", icon: Crosshair, id: "analysis" },
    { href: "/pricing", label: "料金", icon: Wallet, id: "pricing" },
  ] as const;
  return <header className="portal-header">
    <Link className="portal-brand" href="/"><span>RR</span><strong>RADIANT REVIEW</strong></Link>
    <nav aria-label="メインナビゲーション">{links.map(({ href, label, icon: Icon, id }) => <a key={href} href={href} aria-current={current === id ? "page" : undefined}><Icon />{label}</a>)}</nav>
    <AccountLink />
  </header>;
}

export function PageLead({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="portal-lead"><p className="eyebrow"><Activity /> {eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}
