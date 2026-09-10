import { recordPaidCheckout, stripeRequest, type StripeCheckoutSession } from "@/lib/billing";
import { getSiteUser, withAuth } from "@/lib/site-user";

async function postHandler(request: Request) {
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "サインイン情報を確認できません。" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return Response.json({ error: "決済情報が正しくありません。" }, { status: 400 });
  }

  try {
    const session = await stripeRequest<StripeCheckoutSession>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand%5B%5D=subscription`,
    );
    if ((session.client_reference_id || session.metadata?.user_id) !== user.id) {
      return Response.json({ error: "この決済を確認する権限がありません。" }, { status: 403 });
    }
    const result = await recordPaidCheckout(session);
    return Response.json(result, { status: result.state === "processing" ? 202 : 200 });
  } catch (error) {
    console.error("billing confirmation failed", error);
    const message = error instanceof Error && error.message === "BILLING_NOT_CONFIGURED"
      ? "決済は現在準備中です。"
      : "支払い結果を確認できませんでした。時間をおいて再度お試しください。";
    return Response.json({ error: message }, { status: 502 });
  }
}

export const POST = withAuth(postHandler);
