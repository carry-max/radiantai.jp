"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BrainCircuit, Film, LoaderCircle, Wallet } from "lucide-react";
import { SiteHeader, PageLead } from "@/components/site-header";
import { PlayerGrowth } from "@/components/player-growth";
import { MonthlyMissions } from "@/components/monthly-missions";
import { useAccount } from "@/components/account-provider";
import type { MonthlySummary } from "@/lib/monthly-missions";

export function DashboardView() {
  const account = useAccount();
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await account.request("/api/missions", { cache: "no-store" }); const data = await response.json() as MonthlySummary & { error?: string }; if (!response.ok) throw new Error(data.error || "進捗を読み込めませんでした。"); setMonthly(data); }
    catch (e) { setError(e instanceof Error ? e.message : "進捗を読み込めませんでした。"); }
    finally { setLoading(false); }
  }, [account.request]);
  useEffect(() => { if (account.snapshot) queueMicrotask(() => void load()); }, [account.snapshot?.user?.id, load]);
  const signedIn = Boolean(account.snapshot?.user);
  return <div className="portal-page dashboard-page"><SiteHeader current="dashboard" /><main className="portal-main">
    <PageLead eyebrow="PLAYER DASHBOARD" title="成長の現在地" description="立ち回りとAIMの評価、30日ミッション、次に取り組む課題を一か所で確認できます。" />
    {!account.snapshot ? <div className="portal-state"><LoaderCircle className="spin" /> アカウントを確認しています…</div> : !signedIn ? <section className="dashboard-gate"><BrainCircuit /><div><h2>記録を見るにはログイン</h2><p>成長グラフとミッションはアカウントごとに保存されます。</p></div><a className="portal-primary" href="/login">ログイン画面へ <ArrowRight /></a></section> : <>
      <section className="dashboard-quick"><article><small>NEXT ACTION</small><strong>{monthly?.cycle?.tasks?.[monthly.cycle.currentStep]?.title || "最初の録画を分析する"}</strong><a href="/analysis"><Film /> 分析画面を開く</a></article><article><small>PLAN</small><strong>利用状況を確認</strong><a href="/pricing"><Wallet /> 料金・プランを見る</a></article></section>
      <PlayerGrowth refreshKey={0} />
      <MonthlyMissions summary={monthly} loading={loading} error={error} notice="" now={renderedAt} recordingId="" renewRequested={false} onRenew={() => { window.location.assign("/analysis"); }} onRetry={() => void load()} onChooseVideo={() => { window.location.assign("/analysis"); }} onEvidence={() => { window.location.assign("/analysis"); }} />
    </>}
  </main></div>;
}
