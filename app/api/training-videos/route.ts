import { z } from "zod";

import { getMissionDb } from "@/lib/monthly-store";
import { sameOriginRequest } from "@/lib/service-config";
import { getSiteUser, withAuth } from "@/lib/site-user";
import {
  COMMUNITY_VIDEO_LIMIT,
  TOTAL_VIDEO_LIMIT,
  getCommunityTrainingVideos,
  selectCommunityTrainingVideo,
  submitCommunityTrainingVideo,
} from "@/lib/training-video-rankings";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const submitSchema = z.object({
  action: z.literal("submit"),
  url: z.string().trim().max(300),
  title: z.string().trim().min(3).max(140),
  creator: z.string().trim().min(1).max(60),
  mode: z.enum(["aim", "tactics"]),
  summary: z.string().trim().max(240).default(""),
}).strict();
const selectSchema = z.object({
  action: z.literal("select"),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  selected: z.boolean(),
}).strict();

async function smallBody(request: Request) {
  const text = await request.text();
  if (text.length > 10_000) throw new Error("too large");
  return JSON.parse(text) as unknown;
}

async function getHandler(request: Request) {
  const user = await getSiteUser(request);
  try {
    const videos = await getCommunityTrainingVideos(getMissionDb(), user?.id || "");
    return json({ signedIn: Boolean(user), videos, count: videos.length, aiCount: TOTAL_VIDEO_LIMIT - COMMUNITY_VIDEO_LIMIT, limit: TOTAL_VIDEO_LIMIT });
  } catch {
    return json({ error: "利用者ランキングを読み込めませんでした。" }, 503);
  }
}

async function postHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return json({ error: "動画を選ぶにはログインしてください。" }, 401);
  if (!sameOriginRequest(request)) return json({ error: "このサイトから操作してください。" }, 403);
  const body = await smallBody(request).catch(() => null);
  const selection = selectSchema.safeParse(body);
  if (selection.success) {
    const found = await selectCommunityTrainingVideo(getMissionDb(), user.id, selection.data.videoId, selection.data.selected);
    return found ? json({ ok: true }) : json({ error: "対象の動画が見つかりません。" }, 404);
  }
  const submission = submitSchema.safeParse(body);
  if (!submission.success) return json({ error: "YouTube URL、動画名、発信者、分類を確認してください。" }, 400);
  const result = await submitCommunityTrainingVideo(getMissionDb(), user.id, submission.data);
  if (result.ok) return json({ ok: true, videoId: result.videoId });
  const messages = {
    invalid: "YouTubeの動画URLを入力してください。",
    daily: "本日の動画登録上限（5本）に達しました。",
    capacity: "動画リンクが上限の300本に達しました。",
  } as const;
  return json({ error: messages[result.reason] }, result.reason === "daily" || result.reason === "capacity" ? 429 : 400);
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
