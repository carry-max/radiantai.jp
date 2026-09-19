"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BrainCircuit, CheckCircle2, KeyRound, LoaderCircle, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const SAMPLE = JSON.stringify([
  { id: "match-jp-001", source: "riot", map: "Ascent", agent: "Jett", result: "loss", kills: 14, deaths: 19, assists: 4, openingDeaths: 5, roundDifference: -5, summary: "Aメインで単独ピークが3回。味方と交換できない距離で最初に倒された。" },
  { id: "match-jp-002", source: "replay", map: "Haven", agent: "Sova", result: "win", kills: 18, deaths: 13, assists: 9, openingDeaths: 1, roundDifference: 4, summary: "ドローン後に味方と進行。守りは取得情報に合わせて早めにローテした。" },
], null, 2);

type ApiResult = {
  error?: string; model?: string;
  results?: { id: string; quality: string; qualityConfidence: number | null; deathCause: string; deathCauseConfidence: number | null; priority: number; needsDeepAnalysis: boolean; deepProbability: number }[];
  failures?: { id: string; error: string }[];
  summary?: { total: number; badMatches: string[]; deathCauses: { cause: string; count: number }[]; weakMaps: { name: string; score: number; matches: number }[]; weakAgents: { name: string; score: number; matches: number }[]; improvementOrder: string[]; deepAnalysisMatches: string[] };
};

export function JevDeveloperView({ userId, email, serverConfigured }: { userId: string; email: string; serverConfigured: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [source, setSource] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const count = useMemo(() => { try { const value = JSON.parse(source); return Array.isArray(value) ? value.length : 0; } catch { return 0; } }, [source]);
  async function run() {
    setBusy(true); setResult(null);
    try {
      const matches = JSON.parse(source);
      const response = await fetch("/api/developer/jev", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Radiant-Account": userId },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, matches }),
      });
      const payload = await response.json() as ApiResult;
      setResult(response.ok ? payload : { error: payload.error || "分類できませんでした。" });
    } catch { setResult({ error: "JSONを確認してください。配列の中に試合データを入れます。" }); }
    finally { setBusy(false); }
  }
  return <main className="jev-console">
    <header className="jev-topbar"><a href="/"><ArrowLeft /> サイトへ戻る</a><span><ShieldCheck /> DEVELOPER ONLY</span></header>
    <section className="jev-hero"><div><p>RADIANT AI / INTERNAL</p><h1>Jev Match Classifier</h1><span>Riot API・Replayから整形した試合データを、最大50件まで高速分類します。</span></div><div className="jev-model"><BrainCircuit /><span><small>MODEL</small><strong>typesafe-ai/jev</strong></span></div></section>
    <section className="jev-flow" aria-label="解析フロー"><span>Riot API / Replay</span><i>→</i><span>Jev AI</span><i>→</i><span>50試合を分類</span><i>→</i><span>Deep解析候補</span></section>
    <section className="jev-grid">
      <div className="jev-panel"><div className="jev-panel-title"><KeyRound /><div><h2>認証</h2><p>{email} のみ表示中</p></div></div><label>Jev / AI Gateway APIキー<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={serverConfigured ? "サーバー設定済み（空欄で使用）" : "AI_GATEWAY_API_KEY"} /></label><small><ShieldCheck /> 入力値は保存せず、このリクエストだけに使用します。</small></div>
      <div className="jev-panel jev-data"><div className="jev-panel-title"><BrainCircuit /><div><h2>試合データ</h2><p>{count} / 50 試合</p></div></div><textarea spellCheck={false} value={source} onChange={event => setSource(event.target.value)} /><Button onClick={() => void run()} disabled={busy || count < 1 || count > 50}>{busy ? <LoaderCircle className="spin" /> : <Play />}{busy ? "分類しています…" : "Jevで分類"}</Button></div>
    </section>
    {result?.error ? <p className="jev-error" role="alert">{result.error}</p> : null}
    {result?.summary ? <section className="jev-results">
      <div className="jev-result-head"><div><p>CLASSIFICATION RESULT</p><h2>{result.summary.total}試合の分類完了</h2></div><span><CheckCircle2 /> {result.model}</span></div>
      <div className="jev-stats"><article><small>悪かった試合</small><strong>{result.summary.badMatches.length}</strong><p>{result.summary.badMatches.join(" / ") || "なし"}</p></article><article><small>Deep解析候補</small><strong>{result.summary.deepAnalysisMatches.length}</strong><p>{result.summary.deepAnalysisMatches.join(" / ") || "なし"}</p></article><article><small>苦手マップ</small><strong>{result.summary.weakMaps[0]?.name || "—"}</strong><p>{result.summary.weakMaps.slice(0, 3).map(item => `${item.name} ${item.score}`).join(" / ")}</p></article><article><small>苦手エージェント</small><strong>{result.summary.weakAgents[0]?.name || "—"}</strong><p>{result.summary.weakAgents.slice(0, 3).map(item => `${item.name} ${item.score}`).join(" / ")}</p></article></div>
      <div className="jev-table-wrap"><table><thead><tr><th>試合</th><th>判定</th><th>デス原因</th><th>優先度</th><th>Deep</th></tr></thead><tbody>{result.results?.map(item => <tr key={item.id}><td>{item.id}</td><td><b data-quality={item.quality}>{item.quality}</b></td><td>{item.deathCause}</td><td>{item.priority.toFixed(1)} / 3</td><td>{item.needsDeepAnalysis ? "必要" : "不要"}</td></tr>)}</tbody></table></div>
      {result.failures?.length ? <p className="jev-error">失敗: {result.failures.map(item => item.id).join(", ")}</p> : null}
    </section> : null}
  </main>;
}
