import { Crosshair, MapPinned } from "lucide-react";

import { PageLead, SiteHeader } from "@/components/site-header";
import { TrainingVideoList } from "@/components/training-video-list";
import { videosForMode } from "@/lib/training-videos";

export default function GuidesPage() {
  return (
    <div className="portal-page guides-page">
      <SiteHeader current="guides" />
      <main className="portal-main">
        <PageLead
          eyebrow="TRAINING LIBRARY"
          title="次の1試合に効く、VALORANT教材"
          description="基礎への効果と練習への落とし込みやすさで並べた、おすすめ学習順です。分析結果から来た場合は、あなたの弱点に近い動画が上から表示されます。"
        />
        <div className="guide-mode-heading"><Crosshair /><div><small>AIM</small><h2>AIM・撃ち合い</h2><p>クロスヘア配置、停止、マイクロ調整、課題別練習を順番に学びます。</p></div></div>
        <TrainingVideoList videos={videosForMode("aim")} preloadFirst />
        <div className="guide-mode-heading"><MapPinned /><div><small>TACTICS</small><h2>立ち回り・ピーク</h2><p>ピークの仕方、角度、1対1の作り方、判断とローテーションを学びます。</p></div></div>
        <TrainingVideoList videos={videosForMode("tactics")} />
        <p className="guide-source-note">掲載順位はRadiant Review独自のおすすめ学習順です。動画は各クリエイターのYouTubeで再生され、公開状況により視聴できなくなる場合があります。</p>
      </main>
      <footer className="portal-footer"><span>RADIANT REVIEW</span><nav><a href="/privacy">データの取り扱い</a><a href="/legal">販売条件・運営情報</a></nav></footer>
    </div>
  );
}
