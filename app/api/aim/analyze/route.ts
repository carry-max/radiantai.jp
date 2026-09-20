import { getSiteUser, withAuth } from "@/lib/site-user";
import { createAimClipReadUrl, removeAimClip } from "@/lib/aim-clip-storage";
import { sameOriginRequest, serviceConfig } from "@/lib/service-config";
import { AccessError, completeAnalysis, failAnalysis, reserveAnalysis, type Reservation } from "@/lib/analysis-access";
import { getEntitlement } from "@/lib/billing";
import { getMissionDb } from "@/lib/monthly-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AimClipRequest = {
  sourceUrl?: unknown;
  storagePath?: unknown;
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

  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!storagePath && (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2500)) {
    return Response.json({ error: "クリップの保存先を確認できません。" }, { status: 400 });
  }
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
  const recordingId = typeof (metadata as Record<string, unknown>).recordingId === "string" ? (metadata as Record<string, unknown>).recordingId as string : "";
  const deathIndex = Number((metadata as Record<string, unknown>).deathIndex);
  if (!/^[a-f0-9]{64}$/.test(recordingId) || !Number.isInteger(deathIndex) || deathIndex < 1 || deathIndex > 99) {
    return Response.json({ error: "試合とデス場面の識別情報を確認できません。" }, { status: 400 });
  }
  let sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
  let reservation: Reservation | null = null;
  try {
    const access = await reserveAnalysis(getMissionDb(), user.id, await getEntitlement(user.id), recordingId, `overwolf-death:${deathIndex}`);
    if (access.cached) return Response.json(access.cached, { headers: { "Cache-Control": "no-store" } });
    reservation = access.reservation;
    if (storagePath) sourceUrl = await createAimClipReadUrl(user.id, storagePath);
    const upstream = await fetch(`${config.videoBackendUrl}/v1/aim/analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.videoBackendToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl, metadata: { ...metadata, siteUserId: user.id } }),
      signal: AbortSignal.timeout(240_000),
    });
    const result = await upstream.json().catch(() => ({ error: "解析結果を読み取れません。" }));
    if (!upstream.ok) {
      if (reservation) await failAnalysis(reservation);
      reservation = null;
      return Response.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    const payload = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
    const review = payload.review && typeof payload.review === "object" ? payload.review as Record<string, unknown> : {};
    if (reservation) await completeAnalysis(reservation, payload, review.status === "ok", payload.usage || {});
    reservation = null;
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (reservation) await failAnalysis(reservation).catch(() => undefined);
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    console.error("aim clip analysis failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "ミクロ解析を開始できませんでした。" }, { status: 502 });
  } finally {
    if (storagePath) await removeAimClip(user.id, storagePath).catch(() => undefined);
  }
}

export const POST = withAuth(post);
