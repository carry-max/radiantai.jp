"use client";

import { Check, ChevronDown, ExternalLink, LoaderCircle, Plus, ThumbsUp, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CommunityTrainingVideo } from "@/lib/training-video-rankings";
import { VALORANT_RANK_GROUPS, rankGroupLabel, type ValorantRankGroup } from "@/lib/training-videos";

type RankingResponse = { videos: CommunityTrainingVideo[]; count: number; aiCount: number; limit: number; error?: string };

export function CommunityVideoRankings() {
  const { request, snapshot } = useAccount();
  const [data, setData] = useState<RankingResponse>({ videos: [], count: 0, aiCount: 17, limit: 300 });
  const [rankGroup, setRankGroup] = useState<ValorantRankGroup>("iron-silver");
  const [expanded, setExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await request("/api/training-videos");
      const next = await response.json() as RankingResponse;
      if (!response.ok) throw new Error(next.error || "読み込めませんでした。");
      setData(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "利用者ランキングを読み込めませんでした。");
    }
  }, [request]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [snapshot, load]);

  const select = async (video: CommunityTrainingVideo) => {
    if (!snapshot?.user) { setNotice("動画を選ぶにはログインしてください。"); return; }
    setBusy(video.videoId); setNotice("");
    try {
      const response = await request("/api/training-videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "select", videoId: video.videoId, selected: !video.selected }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "更新できませんでした。");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "更新できませんでした。"); }
    finally { setBusy(""); }
  };

  const submit = async (formData: FormData) => {
    setBusy("submit"); setNotice("");
    try {
      const response = await request("/api/training-videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          url: formData.get("url"),
          title: formData.get("title"),
          creator: formData.get("creator"),
          mode: formData.get("mode"),
          rankGroup: formData.get("rankGroup"),
          summary: formData.get("summary"),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "登録できませんでした。");
      await load();
      setFormOpen(false); setNotice("動画を登録し、あなたの1票を追加しました。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "登録できませんでした。"); }
    finally { setBusy(""); }
  };

  const filtered = data.videos.filter((video) => video.rankGroup === rankGroup);
  const visible = expanded ? filtered : filtered.slice(0, 12);

  return (
    <section className="community-ranking" id="community-ranking">
      <div className="community-ranking-head">
        <div><p className="eyebrow"><UsersRound /> USER PICKS</p><h2>ユーザーのおすすめ</h2><p>ユーザーが投稿・推薦した動画を、3つのランク帯ごとに選択数が多い順で表示します。ログインすると動画の追加と推薦ができます。</p></div>
        <div className="community-count"><strong>{data.aiCount + data.count}</strong><span>AI {data.aiCount} ＋ 利用者 {data.count} / 最大 {data.limit} 本</span></div>
      </div>
      <div className="community-controls">
        <div className="community-tabs" aria-label="おすすめ動画のランク帯">
          {VALORANT_RANK_GROUPS.map((group) => <button type="button" key={group.id} aria-pressed={rankGroup === group.id} onClick={() => { setRankGroup(group.id); setExpanded(false); }}>{group.label}</button>)}
        </div>
        {snapshot?.user ? <Button type="button" variant="outline" onClick={() => setFormOpen((current) => !current)}><Plus /> おすすめ動画を追加</Button> : <Link className="portal-secondary" href="/login">ログインしておすすめを追加</Link>}
      </div>
      {formOpen ? (
        <form className="community-submit" action={(formData) => void submit(formData)}>
          <div><label htmlFor="community-url">YouTube URL</label><Input id="community-url" name="url" type="url" required maxLength={300} placeholder="https://www.youtube.com/watch?v=..." /></div>
          <div><label htmlFor="community-title">動画名</label><Input id="community-title" name="title" required minLength={3} maxLength={140} /></div>
          <div><label htmlFor="community-creator">発信者</label><Input id="community-creator" name="creator" required maxLength={60} /></div>
          <div><label htmlFor="community-rank-group">おすすめするランク帯</label><NativeSelect id="community-rank-group" name="rankGroup" defaultValue={rankGroup}>{VALORANT_RANK_GROUPS.map((group) => <NativeSelectOption value={group.id} key={group.id}>{group.label}</NativeSelectOption>)}</NativeSelect></div>
          <div><label htmlFor="community-mode">分類</label><NativeSelect id="community-mode" name="mode" defaultValue="aim"><NativeSelectOption value="aim">AIM</NativeSelectOption><NativeSelectOption value="tactics">立ち回り</NativeSelectOption></NativeSelect></div>
          <div className="community-summary"><label htmlFor="community-summary">学べること（任意）</label><Input id="community-summary" name="summary" maxLength={240} placeholder="例：ピーク前のプリエイムを学べる" /></div>
          <Button type="submit" disabled={busy === "submit"}>{busy === "submit" ? <LoaderCircle className="spin" /> : <Plus />} 登録して選ぶ</Button>
        </form>
      ) : null}
      {notice ? <p className="community-notice" role="status">{notice}</p> : null}
      {visible.length ? <div className="community-video-grid">{visible.map((video, index) => (
        <article className="community-video-card" key={video.videoId}>
          <a className="community-thumb" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.title}をYouTubeで見る`}><Image src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} alt="" fill unoptimized sizes="(max-width: 760px) 100vw, 280px" /></a>
          <div className="community-rank"><strong>#{index + 1}</strong><span>{rankGroupLabel(video.rankGroup)}</span><small>{video.mode === "aim" ? "AIM" : "立ち回り"}</small></div>
          <div className="community-video-copy"><small>{video.creator}</small><h3>{video.title}</h3>{video.summary ? <p>{video.summary}</p> : null}<a href={video.url} target="_blank" rel="noreferrer">YouTubeで見る <ExternalLink /></a></div>
          <Button type="button" variant={video.selected ? "default" : "outline"} disabled={busy === video.videoId} aria-pressed={video.selected} onClick={() => void select(video)}>{busy === video.videoId ? <LoaderCircle className="spin" /> : video.selected ? <Check /> : <ThumbsUp />} {video.voteCount}</Button>
        </article>
      ))}</div> : <div className="community-empty"><UsersRound /><strong>{rankGroupLabel(rankGroup)}のおすすめはまだありません</strong><p>ログインすると、このランク帯に最初のおすすめ動画を追加できます。</p></div>}
      {!expanded && filtered.length > 12 ? <Button className="community-more" type="button" variant="ghost" onClick={() => setExpanded(true)}>残り{filtered.length - 12}本を表示 <ChevronDown /></Button> : null}
    </section>
  );
}
