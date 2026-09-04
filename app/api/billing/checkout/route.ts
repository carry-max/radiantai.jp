import {
  type BillingPlan,
  getBillingPlanDetails,
  PAYPAY_ACCESS_DAYS,
  stripeCheckoutConfigured,
  stripeRequest,
} from "@/lib/billing";
import { getSiteUser } from "@/lib/site-user";

type CheckoutResponse = { id: string; url: string | null };

export async function POST(request: Request) {
  const user = getSiteUser(request);
  if (!user) {
    return Response.json({ error: "購入にはChatGPTへのサインインが必要です。" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { plan?: unknown };
  const planDetails = getBillingPlanDetails(body.plan);
  if (!planDetails) {
    return Response.json({ error: "料金プランを選び直してください。" }, { status: 400 });
  }
  if (!stripeCheckoutConfigured()) {
    return Response.json({
      code: "billing_not_configured",
      error: "決済は現在準備中です。Stripeの本番設定後に購入できるようになります。",
    }, { status: 503 });
  }

  const plan = body.plan as BillingPlan;
  const payPay = planDetails.paymentMethod === "paypay";
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();
  params.set("mode", payPay ? "payment" : "subscription");
  params.set("locale", "ja");
  params.set("client_reference_id", user.id);
  if (user.email) params.set("customer_email", user.email);
  params.set("payment_method_types[0]", payPay ? "paypay" : "card");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "jpy");
  params.set("line_items[0][price_data][unit_amount]", String(planDetails.priceYen));
  params.set("line_items[0][price_data][tax_behavior]", "inclusive");
  params.set("line_items[0][price_data][product_data][name]", planDetails.productName);
  params.set("line_items[0][price_data][product_data][description]", payPay
    ? `AI解析${planDetails.analysisCredits}試合分・購入日から${PAYPAY_ACCESS_DAYS}日・自動更新なし`
    : `AI解析${planDetails.analysisCredits}試合分・毎月自動更新・いつでも解約可能`);
  if (!payPay) params.set("line_items[0][price_data][recurring][interval]", "month");
  params.set("metadata[user_id]", user.id);
  params.set("metadata[plan]", plan);
  params.set("metadata[tier]", planDetails.tier);
  params.set("metadata[analysis_credits]", String(planDetails.analysisCredits));
  if (payPay) {
    params.set("metadata[access_days]", String(PAYPAY_ACCESS_DAYS));
    params.set("payment_intent_data[metadata][user_id]", user.id);
    params.set("payment_intent_data[metadata][plan]", plan);
    params.set("payment_intent_data[metadata][tier]", planDetails.tier);
    params.set("payment_intent_data[metadata][analysis_credits]", String(planDetails.analysisCredits));
  } else {
    params.set("subscription_data[metadata][user_id]", user.id);
    params.set("subscription_data[metadata][plan]", plan);
    params.set("subscription_data[metadata][tier]", planDetails.tier);
    params.set("subscription_data[metadata][analysis_credits]", String(planDetails.analysisCredits));
  }
  params.set("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${origin}/?checkout=cancelled`);

  try {
    const checkout = await stripeRequest<CheckoutResponse>("/checkout/sessions", {
      method: "POST",
      body: params,
    });
    if (!checkout.url) throw new Error("STRIPE_ERROR:決済画面を作成できませんでした。");
    return Response.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^STRIPE_ERROR:/, "") : "決済画面を開けませんでした。";
    return Response.json({ error: message }, { status: 502 });
  }
}
