import { getSiteUser, withAuth } from "@/lib/site-user";
import { sameOriginRequest, serviceConfig } from "@/lib/service-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AimClipRequest = {
  sourceUrl?: unknown;
  metadata?: unknown;
};

async function post(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "送信元を確認できません。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });

  const config = serviceConfig();
  if (!config.videoBackendUrl || !config.videoBackendToken) {
    return Response.json({ error: "ミクロAI解析は準備中です。" }, { status: 503 });
  }

  let body: AimClipRequest;
  try { body = await request.json() as AimClipRequest; }
  catch { return Response.json({ error: "送信内容を読み取れません。" }, { status: 400 }); }

  if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2500) {
    return Response.json({ error: "クリップの保存先を確認できません。" }, { status: 400 });
  }
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

  const upstream = await fetch(`${config.videoBackendUrl}/v1/aim/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.videoBackendToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sourceUrl: body.sourceUrl, metadata: { ...metadata, siteUserId: user.id } }),
    signal: AbortSignal.timeout(240_000),
  });
  const result = await upstream.json().catch(() => ({ error: "解析結果を読み取れません。" }));
  return Response.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
}

export const POST = withAuth(post);
