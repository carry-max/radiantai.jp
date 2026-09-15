import { ChevronRight, ListVideo } from "lucide-react";

import { PageLead, SiteHeader } from "@/components/site-header";
import { TrainingVideoList } from "@/components/training-video-list";
import { CommunityVideoRankings } from "@/components/community-video-rankings";
import { VALORANT_RANKS, videosForRank, type ValorantRank } from "@/lib/training-videos";

const RANK_FOCUS: Record<ValorantRank, string> = {
  アイアン: "ルールとラウンドの基本を理解する",
  ブロンズ: "ストッピングとクロスヘアの土台を固める",
  シルバー: "毎日続けられるAIM練習の型を作る",
  ゴールド: "視点移動と撃ち合いを安定させる",
  プラチナ: "ピークとクリアリングを実戦につなげる",
  ダイヤ: "判断と立ち回りの再現性を高める",
  アセンダント: "有利な条件で撃ち合う技術を磨く",
  イモータル: "攻めの流れとラウンド全体を組み立てる",
  レディアント: "ピークと接敵判断の細部を最適化する",
};

const rankId = (rank: ValorantRank) => `rank-${VALORANT_RANKS.indexOf(rank) + 1}`;

export default function GuidesPage() {
  return (
    <div className="portal-page guides-page">
      <SiteHeader current="guides" />
      <main className="portal-main">
        <PageLead
          eyebrow="TRAINING LIBRARY"
          title="ランク別 VALORANTおすすめ動画"
          description="今のランクで優先したい日本語動画を、アイアンからレディアントまでおすすめ順に5本ずつまとめました。1位から順番に取り組めます。"
        />
        <div className="ai-ranking-label"><strong>ランク別おすすめ TOP 5</strong><span>各ランクの課題への効果と、練習へ移しやすい順番で選定</span></div>
        <nav className="rank-guide-nav" aria-label="VALORANTランク別動画">
          {VALORANT_RANKS.map((rank) => <a key={rank} href={`#${rankId(rank)}`}>{rank}<ChevronRight /></a>)}
        </nav>
        <div className="rank-guide-list">
          {VALORANT_RANKS.map((rank, index) => (
            <section className="rank-guide-section" id={rankId(rank)} key={rank}>
              <div className="rank-guide-heading">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <ListVideo />
                <div><small>RANK GUIDE</small><h2>{rank}</h2><p>{RANK_FOCUS[rank]}</p></div>
              </div>
              <TrainingVideoList videos={videosForRank(rank)} preloadFirst={index === 0} />
            </section>
          ))}
        </div>
        <p className="guide-source-note">順位は、各ランクで優先したい課題との関連性と、次の試合で実践しやすい学習順を基準にしています。同じ基礎動画を複数ランクで紹介する場合があります。</p>
        <CommunityVideoRankings />
      </main>
      <footer className="portal-footer"><span>RADIANT REVIEW</span><nav><a href="/privacy">データの取り扱い</a><a href="/legal">販売条件・運営情報</a></nav></footer>
    </div>
  );
}
