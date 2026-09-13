import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, Crosshair, LayoutDashboard, ShieldCheck, Sparkles, Target } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return <div className="portal-page landing-page">
    <SiteHeader current="home" />
    <main>
      <section className="landing-hero">
        <div className="landing-copy"><p className="eyebrow"><Sparkles /> VALORANT POST-MATCH COACH</p><h1>1デスを、<span>次の成長</span>に変える。</h1><p>録画から立ち回りとAIMを分けて確認。見えた根拠だけを使い、次に直す行動を1つに絞ります。</p><div className="landing-actions"><a className="portal-primary" href="/analysis">無料で分析を試す <ArrowRight /></a><a className="portal-secondary" href="/dashboard">成長グラフを見る</a></div><small><ShieldCheck /> 動画は端末内で処理。AIには選んだ最大6枚だけを送信します。</small></div>
        <div className="landing-visual" aria-label="分析から成長記録までの流れ"><div className="landing-score"><small>NEXT FOCUS</small><strong>ピーク前に照準の高さを確認</strong><span>根拠 3 / 6 フレーム</span></div><div className="landing-rings"><span>AIM</span><b>60</b><small>この場面の評価</small></div><div className="landing-signal"><i /><span>立ち回りとAIMを切替</span></div></div>
      </section>
      <section className="landing-path" aria-labelledby="path-title"><div><p className="eyebrow">HOW IT WORKS</p><h2 id="path-title">録画を選んで、改善まで3ステップ</h2></div><ol><li><span>01</span><Crosshair /><strong>場面を選ぶ</strong><p>立ち回りはデス前後、AIMは撃ち始め付近を切り出します。</p></li><li><span>02</span><BrainCircuit /><strong>根拠を確認</strong><p>画像で確認できる事実と、推測・測れない項目を分けます。</p></li><li><span>03</span><LayoutDashboard /><strong>成長を残す</strong><p>12項目のグラフと30日ミッションで変化を追います。</p></li></ol></section>
      <section className="landing-modes"><article><Target /><div><small>TACTICS</small><h2>立ち回り分析</h2><p>ピーク判断、位置取り、味方とのタイミング、スキル運用を振り返ります。</p><a href="/analysis">立ち回りを分析 <ArrowRight /></a></div></article><article><Crosshair /><div><small>AIM</small><h2>AIM分析</h2><p>照準の初期位置、クロスヘア配置、修正の大きさを6枚で確認します。</p><a href="/analysis">AIMを分析 <ArrowRight /></a></div></article><article className="landing-guide-card"><BookOpen /><div><small>TRAINING LIBRARY</small><h2>おすすめ動画教材</h2><p>AIMと立ち回りを、基礎から実戦へつながる学習順で確認できます。</p><a href="/guides">教材一覧を見る <ArrowRight /></a></div></article></section>
      <section className="landing-price"><div><p className="eyebrow">SIMPLE PRICING</p><h2>両モード、同じ料金。</h2><p>Reviewは900円で5試合、Climbは1,800円で10試合。各試合で合計3解析を自由に配分できます。</p></div><ul><li><CheckCircle2 /> AI費用込み</li><li><CheckCircle2 /> 保存済み結果の再表示は枠を消費しない</li><li><CheckCircle2 /> 無料体験から自動課金なし</li></ul><a className="portal-secondary" href="/pricing">料金を詳しく見る <ArrowRight /></a></section>
    </main>
    <footer className="portal-footer"><span>RADIANT REVIEW</span><nav><a href="/privacy">データの取り扱い</a><a href="/legal">販売条件・運営情報</a></nav></footer>
  </div>;
}
