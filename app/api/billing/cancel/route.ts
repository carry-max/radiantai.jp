import { getSiteUser, withAuth } from "@/lib/site-user";
import { getMissionDb } from "@/lib/monthly-store";
import { stripeRequest, type StripeSubscription } from "@/lib/billing";
import { sameOriginRequest } from "@/lib/service-config";

async function postHandler(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });
  try {
    const row = await getMissionDb().prepare("SELECT subscription_id FROM billing_entitlements WHERE user_id = ?").bind(user.id).first<{ subscription_id: string | null }>();
    if (!row?.subscription_id) return Response.json({ error: "自動更新される契約はありません。" }, { status: 400 });
    const result = await stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(row.subscription_id)}`, {
      method: "POST", body: new URLSearchParams({ cancel_at_period_end: "true" }),
    });
    if (!result.cancel_at_period_end) throw new Error("not cancelled");
    return Response.json({ ok: true, message: "次回の自動更新を停止しました。契約期間の終了まで残りの解析枠を使えます。" });
  } catch { return Response.json({ error: "更新停止を確認できませんでした。時間をおいて再度お試しください。" }, { status: 502 }); }
}

export const POST = withAuth(postHandler);
