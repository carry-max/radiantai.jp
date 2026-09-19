import type { MissionDatabase } from "@/lib/monthly-store";
import { TRAINING_VIDEOS, type TrainingVideoMode, type ValorantRankGroup } from "@/lib/training-videos";

export const TOTAL_VIDEO_LIMIT = 300;
export const COMMUNITY_VIDEO_LIMIT = TOTAL_VIDEO_LIMIT - TRAINING_VIDEOS.length;
export const DAILY_SUBMISSION_LIMIT = 5;
const JAPAN_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;

export type CommunityTrainingVideo = {
  videoId: string;
  url: string;
  title: string;
  creator: string;
  mode: TrainingVideoMode;
  rankGroup: ValorantRankGroup;
  summary: string;
  voteCount: number;
  selected: boolean;
};

type CommunityVideoRow = {
  video_id: string;
  url: string;
  title: string;
  creator: string;
  mode: string;
  rank_group: string;
  summary: string;
  vote_count: number | string;
  selected: number | string;
};

export function youtubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) id = url.pathname.split("/")[2] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function mapRow(row: CommunityVideoRow): CommunityTrainingVideo {
  return {
    videoId: row.video_id,
    url: row.url,
    title: row.title,
    creator: row.creator,
    mode: row.mode === "aim" ? "aim" : "tactics",
    rankGroup: row.rank_group === "gold-diamond" || row.rank_group === "ascendant-radiant" ? row.rank_group : "iron-silver",
    summary: row.summary,
    voteCount: Number(row.vote_count),
    selected: Number(row.selected) === 1,
  };
}

export async function getCommunityTrainingVideos(db: MissionDatabase, userId = "") {
  const result = await db.prepare(`SELECT v.video_id, v.url, v.title, v.creator, v.mode, v.rank_group, v.summary,
    COUNT(votes.user_id) AS vote_count,
    MAX(CASE WHEN votes.user_id = ? THEN 1 ELSE 0 END) AS selected
    FROM training_videos v
    LEFT JOIN training_video_votes votes ON votes.video_id = v.video_id
    WHERE v.approved = 1
    GROUP BY v.video_id, v.url, v.title, v.creator, v.mode, v.rank_group, v.summary, v.created_at
    ORDER BY vote_count DESC, v.created_at ASC, v.video_id ASC
    LIMIT ?`).bind(userId, COMMUNITY_VIDEO_LIMIT).all<CommunityVideoRow>();
  return result.results.map(mapRow);
}

export async function submitCommunityTrainingVideo(
  db: MissionDatabase,
  userId: string,
  input: { url: string; title: string; creator: string; mode: TrainingVideoMode; rankGroup: ValorantRankGroup; summary: string },
  now = Date.now(),
) {
  const videoId = youtubeVideoId(input.url);
  if (!videoId) return { ok: false as const, reason: "invalid" as const };
  const existing = await db.prepare("SELECT video_id FROM training_videos WHERE video_id = ? LIMIT 1").bind(videoId).first();
  if (!existing) {
    const japanDay = new Date(now + JAPAN_TIME_OFFSET_MS);
    japanDay.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(japanDay.getTime() - JAPAN_TIME_OFFSET_MS);
    const daily = await db.prepare("SELECT COUNT(*) AS total FROM training_videos WHERE submitted_by = ? AND created_at >= ?")
      .bind(userId, dayStart.toISOString()).first<{ total: number | string }>();
    if (Number(daily?.total || 0) >= DAILY_SUBMISSION_LIMIT) return { ok: false as const, reason: "daily" as const };
  }

  const timestamp = new Date(now).toISOString();
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  await db.batch([
    db.prepare(`INSERT INTO training_videos (id, video_id, url, title, creator, mode, rank_group, summary, submitted_by, created_at, approved)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
      WHERE (SELECT COUNT(*) FROM training_videos) < ?
      ON CONFLICT(video_id) DO NOTHING`)
      .bind(crypto.randomUUID(), videoId, canonicalUrl, input.title, input.creator, input.mode, input.rankGroup, input.summary, userId, timestamp, COMMUNITY_VIDEO_LIMIT),
    db.prepare(`INSERT INTO training_video_votes (video_id, user_id, created_at)
      SELECT video_id, ?, ? FROM training_videos WHERE video_id = ? AND approved = 1
      ON CONFLICT(video_id, user_id) DO NOTHING`).bind(userId, timestamp, videoId),
  ]);
  const saved = await db.prepare("SELECT video_id FROM training_videos WHERE video_id = ? AND approved = 1 LIMIT 1").bind(videoId).first();
  return saved ? { ok: true as const, videoId } : { ok: false as const, reason: "capacity" as const };
}

export async function selectCommunityTrainingVideo(db: MissionDatabase, userId: string, videoId: string, selected: boolean, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return false;
  if (selected) {
    await db.batch([db.prepare(`INSERT INTO training_video_votes (video_id, user_id, created_at)
      SELECT video_id, ?, ? FROM training_videos WHERE video_id = ? AND approved = 1
      ON CONFLICT(video_id, user_id) DO NOTHING`).bind(userId, new Date(now).toISOString(), videoId)]);
  } else {
    await db.batch([db.prepare("DELETE FROM training_video_votes WHERE video_id = ? AND user_id = ?").bind(videoId, userId)]);
  }
  return Boolean(await db.prepare("SELECT video_id FROM training_videos WHERE video_id = ? AND approved = 1 LIMIT 1").bind(videoId).first());
}
