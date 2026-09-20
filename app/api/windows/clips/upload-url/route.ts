import { createAimClipUpload } from "@/lib/aim-clip-storage";
import { getSiteUser, withAuth } from "@/lib/site-user";
import { sameOriginRequest } from "@/lib/service-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: Request) => {
  if (!sameOriginRequest(request)) return Response.json({ error: "送信元を確認できません。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });
  let input: { size?: unknown; contentType?: unknown };
  try { input = await request.json() as typeof input; }
  catch { return Response.json({ error: "クリップ情報を読み取れません。" }, { status: 400 }); }
  if (!Number.isInteger(input.size) || Number(input.size) < 1 || Number(input.size) > 120 * 1024 * 1024 || input.contentType !== "video/mp4") {
    return Response.json({ error: "MP4クリップは120MBまで送信できます。" }, { status: 400 });
  }
  try {
    return Response.json(await createAimClipUpload(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("aim clip upload ticket failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "クリップ保存先は準備中です。" }, { status: 503 });
  }
});
