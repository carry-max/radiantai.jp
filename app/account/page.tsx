"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/account-provider";
import { importDeviceHistory } from "@/lib/account-storage";

const messages: Record<string, string> = {
  "signed-in": "ログインしました。", "signed-out": "この端末からログアウトしました。",
  "signed-out-local": "このブラウザのログイン情報を削除しました。接続先でのログアウトは確認できませんでした。",
  "setup": "ログインは準備中です。", "cancelled": "ログインをキャンセルしました。もう一度お試しいただけます。",
  "expired": "ログインの有効時間が過ぎたか、別のブラウザで開かれました。下のボタンからやり直してください。",
  "invalid-provider": "ログイン方法を選び直してください。",
  "provider-unavailable": "このログイン方法は現在利用できません。時間をおいて再度お試しください。",
  "link-unavailable": "連携できませんでした。連携機能が未設定か、すでに別のアカウントで使われている可能性があります。",
  "account-changed": "アカウントが変わりました。現在のアカウントを確認して、もう一度操作してください。",
  "imported": "以前のアカウントのミッション・XP・利用状況を引き継ぎました。",
  "import-conflict": "すでに使用中のアカウント同士は自動で統合できません。元の記録は保持されています。",
};

export default function AccountPage() {
  const { snapshot, error, refresh } = useAccount();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status") || "";
    if (["signed-in", "imported"].includes(status) && !(snapshot?.mode === "supabase" && snapshot.user)) return;
    if (["signed-out", "signed-out-local"].includes(status) && (!snapshot || snapshot.user)) return;
    setNotice(messages[status] || "");
  }, [snapshot?.mode, snapshot?.user?.id]);
  const user = snapshot?.user;
  const socialUser = Boolean(user && snapshot?.mode === "supabase");
  const providerForm = (provider: "google" | "x", linking = false) => {
    const label = provider === "google" ? "Google" : "X（Twitter）";
    const linked = user?.providers.includes(provider) || provider === "x" && user?.providers.includes("twitter");
    return <form key={provider} action="/auth/start" method="post" target="_top" onSubmit={() => setBusy(provider)}>
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="intent" value={linking ? "link" : "login"} />
      <input type="hidden" name="account" value={user?.id || ""} />
      <Button className={`social-button social-${provider}`} type="submit" disabled={!snapshot?.configured || Boolean(busy) || linking && Boolean(linked)}>
        {linking && linked ? <CheckCircle2 aria-hidden="true" /> : null}
        {busy === provider ? "移動しています…" : linking ? `${label} ${linked ? "連携済み" : "を連携"}` : `${label}でログイン`}
      </Button>
    </form>;
  };
  return <main className="account-page">
    <a className="account-back" href="/">Radiant Reviewへ戻る</a>
    <section className="account-card" aria-labelledby="account-title">
      <span className="account-symbol"><UserRound aria-hidden="true" /></span>
      <p className="eyebrow">RADIANT REVIEW</p>
      <h1 id="account-title">{socialUser ? "アカウント" : "ログイン"}</h1>
      <p className="account-description">ミッション・月間XP・成長記録を、あなたのアカウントで続けられます。</p>
      {notice ? <p className="account-notice" role="status">{notice}</p> : null}
      {error ? <div className="account-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>再読み込み</Button></div> : null}
      {!snapshot && !error ? <p className="account-description" role="status">ログイン情報を確認しています…</p> : null}
      {user ? <div className="account-person"><strong>{user.name}</strong>{user.email && user.email !== user.name ? <span>{user.email}</span> : null}<small>{socialUser ? "ログイン中" : "現在はChatGPTでログイン中"}</small></div> : null}
      {socialUser ? <>
        <h2>ログイン方法</h2>
        <p className="account-description">別のログイン方法も連携すると、同じ記録を使えます。</p>
        <div className="social-buttons">{providerForm("google", true)}{providerForm("x", true)}</div>
        <a className="account-continue" href="/">録画のレビューを始める</a>
        <form action="/auth/signout" method="post" target="_top" onSubmit={() => setBusy("signout")}>
          <input type="hidden" name="account" value={user!.id} />
          <Button type="submit" variant="outline" disabled={Boolean(busy)}>{busy === "signout" ? "ログアウト中…" : "この端末からログアウト"}</Button>
        </form>
      </> : <>
        <div className="social-buttons">{providerForm("google")}{providerForm("x")}</div>
        {snapshot && !snapshot.configured ? <p className="account-notice">Google・Xログインは準備中です。接続が完了すると利用できます。</p> : null}
      </>}
      {snapshot?.canImportHistory && user ? <div className="account-import">
        <h2>以前の記録を引き継ぐ</h2>
        <p>現在ChatGPTでログインしているアカウントのミッション・XP・利用状況を引き継ぎます。新しい解析・記録・購入を始める前に行ってください。</p>
        <form action="/auth/import-history" method="post" target="_top" onSubmit={() => setBusy("import")}>
          <input type="hidden" name="account" value={user.id} />
          <Button type="submit" variant="outline" disabled={Boolean(busy)}>以前のアカウントを引き継ぐ</Button>
        </form>
      </div> : null}
      {snapshot?.canImportDeviceHistory && user ? <div className="account-import">
        <h2>この端末の旧レポート</h2>
        <p>以前この端末で保存したレポートと単発ミッションのXPを取り込みます。自分の記録であることを確認してから操作してください。</p>
        <Button variant="outline" onClick={() => {
          try { setNotice(importDeviceHistory(localStorage, user.id) ? "端末内の記録を取り込みました。レビュー画面で確認できます。" : "取り込む旧レポートはありません。"); }
          catch (e) { setNotice(e instanceof Error ? e.message : "記録を取り込めませんでした。"); }
        }}>自分の旧レポートを取り込む</Button>
      </div> : null}
      <p className="account-footnote"><ShieldCheck aria-hidden="true" />パスワードはGoogle・Xの画面で入力します。</p>
      <nav className="account-legal"><a href="/privacy">プライバシー</a><a href="/legal">利用条件・販売者情報</a></nav>
    </section>
  </main>;
}
