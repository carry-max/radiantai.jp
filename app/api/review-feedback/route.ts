import { getSiteUser, withAuth } from "@/lib/site-user";
import { getMissionDb } from "@/lib/monthly-store";
import { sameOriginRequest } from "@/lib/service-config";
import { z } from "zod";

const feedbackSchema = z.object({ id: z.string().min(1).max(80), rating: z.enum(["helpful", "incorrect"]) });

async function postHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });
  if (!sameOriginRequest(request)) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "評価を選んでください。" }, { status: 400 });
  const body = parsed.data;
  const row = await getMissionDb().prepare("UPDATE analysis_records SET feedback = ? WHERE id = ? AND user_id = ? AND status IN ('succeeded','insufficient') RETURNING id").bind(body.rating, body.id, user.id).first();
  return Response.json(row ? { ok: true } : { error: "レビューが見つかりません。" }, { status: row ? 200 : 404 });
}

export const POST = withAuth(postHandler);
