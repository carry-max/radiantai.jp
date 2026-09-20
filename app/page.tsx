import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, Crosshair, LayoutDashboard, ShieldCheck, Sparkles, Target } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return <div className="portal-page landing-page">
    <SiteHeader current="home" />
    <main>
      <section className="landing-hero">
        <div className="landing-copy"><p className="eyebrow"><Sparkles /> VALORANT POST-MATCH COACH</p><h1>試合判断と撃ち合いを、<span>別々に伸ばす。</span></h1><p>立ち回りはRiot APIだけで最大50試合を分析。ミクロはOverwolfがデス前後を自動保存し、映像から直す行動を1つに絞ります。</p><div className="landing-actions"><a className="portal-primary" href="/analysis">無料で分析を試す <ArrowRight /></a><a className="portal-secondary" href="/dashboard">成長グラフを見る</a></div><small><ShieldCheck /> 立ち回りは録画不要。ミクロも手動録画・アップロード不要です。</small></div>
        <div className="landing-visual" aria-label="分析から成長記録までの流れ"><div className="landing-score"><small>NEXT FOCUS</small><strong>ピーク前に照準の高さを確認</strong><span>根拠 3 / 6 フレーム</span></div><div className="landing-rings"><span>AIM</span><b>60</b><small>この場面の評価</small></div><div className="landing-signal"><i /><span>立ち回りとAIMを切替</span></div></div>
      </section>
      <section className="landing-path" aria-labelledby="path-title"><div><p className="eyebrow">HOW IT WORKS</p><h2 id="path-title">試合後、自動で改善点まで整理</h2></div><ol><li><span>01</span><Crosshair /><strong>データを自動取得</strong><p>Riot APIとOverwolfが、戦績とデスクリップを試合後に準備します。</p></li><li><span>02</span><BrainCircuit /><strong>AIで二段解析</strong><p>Jev／Geminiが分類・観測し、GPTが改善点を整理します。</p></li><li><span>03</span><LayoutDashboard /><strong>成長を残す</strong><p>12項目のグラフと30日ミッションで変化を追います。</p></li></ol></section>
      <section className="landing-modes"><article><Target /><div><small>TACTICS</small><h2>立ち回り分析</h2><p>録画なしで最大50試合。Riot API → Jev → GPTで判断傾向を分析します。</p><a href="/analysis">立ち回りを分析 <ArrowRight /></a></div></article><article><Crosshair /><div><small>MICRO</small><h2>ミクロ分析</h2><p>録画操作なし。Overwolf → Gemini → GPTでデス前後の撃ち合いを分析します。</p><a href="/analysis">ミクロを分析 <ArrowRight /></a></div></article><article className="landing-guide-card"><BookOpen /><div><small>DEEP</small><h2>Deep分析</h2><p>重要な試合や場面を選び、配置・情報・ローテ・敗因を詳しく確認します。</p><a href="/analysis">Deepを使う <ArrowRight /></a></div></article></section>
      <section className="landing-price"><div><p className="eyebrow">SIMPLE PRICING</p><h2>月額900円。</h2><p>立ち回り50試合・ミクロ5試合・Deep 2試合。未使用分は月2試合まで別モードへ振替できます。</p></div><ul><li><CheckCircle2 /> Jev・Gemini・GPT費用込み</li><li><CheckCircle2 /> 保存済み結果の再表示は枠を消費しない</li><li><CheckCircle2 /> 無料体験から自動課金なし</li></ul><a className="portal-secondary" href="/pricing">料金を詳しく見る <ArrowRight /></a></section>
    </main>
    <footer className="portal-footer"><span>RADIANT REVIEW</span><nav><a href="/privacy">データの取り扱い</a><a href="/legal">販売条件・運営情報</a></nav></footer>
  </div>;
}
