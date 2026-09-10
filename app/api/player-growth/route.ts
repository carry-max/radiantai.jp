import { z } from "zod";
import { getSiteUser, withAuth } from "@/lib/site-user";
import { getMissionDb } from "@/lib/monthly-store";
import { PLAYER_SKILLS, type PlayerSkillId } from "@/lib/player-growth";
import { getPlayerGrowth, saveSelfGrowth, deleteSelfGrowth } from "@/lib/player-growth-store";
import { sameOriginRequest } from "@/lib/service-config";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const schema = z.object({
  id: z.string().uuid(), label: z.string().trim().max(100), note: z.string().trim().max(500),
  ratings: z.array(z.object({ skill: z.string().refine(id => PLAYER_SKILLS.some(s => s.id === id)), level: z.number().int().min(1).max(5) }).strict()).min(1).max(12),
}).strict().refine(body => new Set(body.ratings.map(r => r.skill)).size === body.ratings.length);

async function smallBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("empty body");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 16000) { await reader.cancel(); throw new Error("too large"); } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { reader.releaseLock(); }
}

async function getHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return json({ signedIn: false, records: [], serverNow: new Date().toISOString() });
  try { return json({ signedIn: true, records: await getPlayerGrowth(getMissionDb(), user.id), serverNow: new Date().toISOString() }); }
  catch { return json({ error: "成長記録を読み込めませんでした。再読み込みしてください。" }, 503); }
}

async function postHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return json({ error: "成長記録を保存するにはログインしてください。" }, 401);
  if (!sameOriginRequest(request)) return json({ error: "このサイトから記録してください。" }, 403);
  const parsed = schema.safeParse(await smallBody(request).catch(() => null));
  if (!parsed.success) return json({ error: "評価を1項目以上、1〜5で選んでください。" }, 400);
  try {
    const record = { ...parsed.data, ratings: parsed.data.ratings.map(r => ({ skill: r.skill as PlayerSkillId, level: r.level, evidence: "本人による練習・試合の振り返り", times: [] })) };
    if (!await saveSelfGrowth(getMissionDb(), user.id, record)) return json({ error: "本日の記録上限（20件）に達したか、記録IDが使用済みです。新しい記録として再度お試しください。" }, 429);
    return json({ ok: true });
  } catch { return json({ error: "記録を保存できませんでした。入力内容はそのままで再度お試しください。" }, 503); }
}

async function deleteHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return json({ error: "ログインしてください。" }, 401);
  if (!sameOriginRequest(request)) return json({ error: "このサイトから操作してください。" }, 403);
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await smallBody(request).catch(() => null));
  if (!parsed.success) return json({ error: "削除する記録を選んでください。" }, 400);
  try {
    if (!await deleteSelfGrowth(getMissionDb(), user.id, parsed.data.id)) return json({ error: "削除できる自己評価が見つかりません。" }, 404);
    return json({ ok: true });
  } catch { return json({ error: "削除できませんでした。再度お試しください。" }, 503); }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
