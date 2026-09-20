import { ChevronRight, ListVideo } from "lucide-react";

import { PageLead, SiteHeader } from "@/components/site-header";
import { TrainingVideoList } from "@/components/training-video-list";
import { CommunityVideoRankings } from "@/components/community-video-rankings";
import { VALORANT_RANK_GROUPS, videosForRankGroup, type ValorantRankGroup } from "@/lib/training-videos";

const RANK_FOCUS: Record<ValorantRankGroup, string> = {
  "iron-silver": "ルール、クロスヘア、ストッピング、AIM練習の土台を作る",
  "gold-diamond": "ピーク、クリアリング、位置取り、判断の再現性を高める",
  "ascendant-radiant": "有利な撃ち合い、攻守のマクロ、接敵判断を磨き込む",
};

const rankId = (group: ValorantRankGroup) => `rank-${group}`;

export default function GuidesPage() {
  return (
    <div className="portal-page guides-page">
      <SiteHeader current="guides" />
      <main className="portal-main">
        <PageLead
          eyebrow="TRAINING LIBRARY"
          title="ランク別 VALORANTおすすめ動画"
          description="今のランク帯で優先したい日本語動画を、3段階に分けておすすめ順に5本ずつまとめました。1位から順番に取り組めます。"
        />
        <div className="ai-ranking-label"><strong>ランク帯別おすすめ TOP 5</strong><span>各ランク帯の課題への効果と、練習へ移しやすい順番で選定</span></div>
        <nav className="rank-guide-nav" aria-label="VALORANTランク帯別動画">
          {VALORANT_RANK_GROUPS.map((group) => <a key={group.id} href={`#${rankId(group.id)}`}>{group.label}<ChevronRight /></a>)}
        </nav>
        <div className="rank-guide-list">
          {VALORANT_RANK_GROUPS.map((group, index) => (
            <section className="rank-guide-section" id={rankId(group.id)} key={group.id}>
              <div className="rank-guide-heading">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <ListVideo />
                <div><small>RANK GROUP</small><h2>{group.label}</h2><p>{RANK_FOCUS[group.id]}</p></div>
              </div>
              <TrainingVideoList videos={videosForRankGroup(group.id)} preloadFirst={index === 0} />
            </section>
          ))}
        </div>
        <p className="guide-source-note">順位は、各ランク帯で優先したい課題との関連性と、次の試合で実践しやすい学習順を基準にしています。</p>
        <CommunityVideoRankings />
      </main>
      <footer className="portal-footer"><span>RADIANT REVIEW</span><nav><a href="/terms">利用規約</a><a href="/privacy">データの取り扱い</a><a href="/legal">販売条件・運営情報</a></nav></footer>
    </div>
  );
}
