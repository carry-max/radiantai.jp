"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { SiteHeader, PageLead } from "@/components/site-header";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";

type Plan = "card_monthly" | "paypay_30day" | "climb_card_monthly" | "climb_paypay_30day";
type Status = { configured: boolean; paypayEnabled: boolean; entitlement: { status: string; remainingDays: number; endsAt: string; plan: string } | null; error?: string };
const TIERS: ReadonlyArray<{ name: string; price: number; matches: number; card: Plan; paypay: Plan; featured?: boolean }> = [{ name: "Review", price: 900, matches: 5, card: "card_monthly", paypay: "paypay_30day" }, { name: "Climb", price: 1800, matches: 10, card: "climb_card_monthly", paypay: "climb_paypay_30day", featured: true }];

export function PricingView() {
  const account = useAccount(); const [status, setStatus] = useState<Status | null>(null); const [busy, setBusy] = useState<Plan | null>(null); const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!account.snapshot) return;
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const checkoutState = params.get("checkout");
        const sessionId = params.get("session_id");
        if (checkoutState === "success" && sessionId) {
          setNotice("支払い結果を確認しています…");
          const response = await account.request("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
          const result = await response.json() as { state?: string; error?: string };
          if (!response.ok && response.status !== 202) throw new Error(result.error || "支払い結果を確認できませんでした。");
          if (active) setNotice(result.state === "processing" ? "PayPayの支払い処理中です。完了後に利用可能になります。" : "支払いを確認し、プランを反映しました。");
        } else if (checkoutState === "cancelled" && active) setNotice("購入はキャンセルされました。料金は発生していません。");
        if (checkoutState) window.history.replaceState({}, "", "/pricing");
        const response = await account.request("/api/billing/status", { cache: "no-store" });
        const next = await response.json() as Status;
        if (active) setStatus(next);
      } catch (e) { if (active) { setNotice(e instanceof Error ? e.message : "利用状況を確認できませんでした。"); setStatus({ configured: false, paypayEnabled: false, entitlement: null }); } }
    };
    void load(); return () => { active = false; };
  }, [account.request, account.snapshot?.user?.id]);
  const checkout = async (plan: Plan) => { if (!account.snapshot?.user) { window.location.assign("/login"); return; } setBusy(plan); setNotice(""); try { const response = await account.request("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) }); const data = await response.json() as { url?: string; error?: string }; if (!response.ok || !data.url) throw new Error(data.error || "決済画面を開けませんでした。"); window.location.assign(data.url); } catch (e) { setNotice(e instanceof Error ? e.message : "決済画面を開けませんでした。"); setBusy(null); } };
  return <div className="portal-page pricing-page"><SiteHeader current="pricing" /><main className="portal-main"><PageLead eyebrow="PRICING" title="料金はそのまま、マクロ枠を拡張" description="マクロはRiot AI 50試合・Replay Coach 5試合・Deep Coach 2試合。AIM自動クリップも現在のプラン枠で利用できます。" />
    {status?.entitlement?.status === "active" ? <div className="pricing-active"><CheckCircle2 /><div><strong>プラン利用中</strong><span>残り{status.entitlement.remainingDays}日・{new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date(status.entitlement.endsAt))}まで</span></div></div> : null}
    <section className="pricing-grid">{TIERS.map(tier => <article key={tier.name} className={tier.featured ? "featured" : ""}>{tier.featured ? <span className="pricing-recommend">AIMも多く見るならこちら</span> : null}<small>{tier.name === "Review" ? "STANDARD" : "MOST POPULAR"}</small><h2>{tier.name}</h2><div className="pricing-value"><strong>¥{tier.price.toLocaleString()}</strong><span>税込 / 30日・月</span></div><ul><li><CheckCircle2 /> Riot AI：最大50試合</li><li><CheckCircle2 /> Replay Coach：5試合</li><li><CheckCircle2 /> Deep Coach：2試合</li><li><CheckCircle2 /> AIM：{tier.matches}試合</li><li><CheckCircle2 /> 各試合 最大3解析・AI費用込み</li><li><CheckCircle2 /> 成長グラフ・30日ミッション</li></ul><div className="pricing-actions"><Button disabled={busy !== null || Boolean(status?.entitlement) || Boolean(status && !status.configured)} onClick={() => void checkout(tier.card)}>{busy === tier.card ? <LoaderCircle className="spin" /> : <CreditCard />}{account.snapshot?.user ? "カードで始める" : "ログインして選ぶ"}</Button><Button variant="outline" disabled={busy !== null || Boolean(status?.entitlement) || !status?.configured || !status.paypayEnabled} onClick={() => void checkout(tier.paypay)}><QrCode /> PayPay 30日パス</Button></div></article>)}</section>
    {!status ? <p className="pricing-notice"><LoaderCircle className="spin" /> 利用状況を確認しています…</p> : !status.configured ? <p className="pricing-notice">有料プランは現在販売準備中です。購入・請求は発生しません。</p> : null}{notice ? <p className="pricing-notice error" role="alert">{notice}</p> : null}
    <section className="pricing-rules"><ShieldCheck /><div><h2>解析枠の数え方</h2><p>有料期間では、マクロ3種類とAIMを別々に数えます。同じモード・同じ録画は最大3解析で、保存済みの同じ結果を再表示しても枠は減りません。無料体験は全モード合計1試合です。</p><p>Riot AIとAIM自動クリップはWindowsにインストールしたRadiant AIアプリから利用します。PayPayは30日間の一回払い、カードは月額自動更新です。</p></div></section>
  </main></div>;
}
