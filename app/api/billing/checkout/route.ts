import {
  type BillingPlan,
  getBillingPlanDetails,
  PAYPAY_ACCESS_DAYS,
  salesConfigured, getEntitlement,
  stripeRequest,
} from "@/lib/billing";
import { getSiteUser, withAuth } from "@/lib/site-user";
import { serviceConfig, sameOriginRequest } from "@/lib/service-config";

type CheckoutResponse = { id: string; url: string | null };

async function postHandler(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "このサイトから購入を開始してください。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user) {
    return Response.json({ error: "購入にはログインが必要です。" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { plan?: unknown } | null;
  if (body?.plan !== "card_monthly" && body?.plan !== "paypay_30day") {
    return Response.json({ error: "現在のプランは月額900円のRadiant AIのみです。" }, { status: 400 });
  }
  const planDetails = getBillingPlanDetails(body?.plan);
  if (!planDetails) {
    return Response.json({ error: "料金プランを選び直してください。" }, { status: 400 });
  }
  if (!salesConfigured() || (planDetails.paymentMethod === "paypay" && !serviceConfig().paypayEnabled)) {
    return Response.json({
      code: "billing_not_configured",
      error: "有料プランは販売準備中です。現在は購入・請求できません。",
    }, { status: 503 });
  }

  const current = await getEntitlement(user.id);
  if (current?.status === "active") return Response.json({ error: "有効なプランがあります。重複購入はできません。" }, { status: 409 });

  const plan = body!.plan as BillingPlan;
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
    ? `立ち回り50試合＋ミクロ5試合＋Deep 2試合・未使用分は最大2試合振替・${PAYPAY_ACCESS_DAYS}日・自動更新なし`
    : `立ち回り50試合＋ミクロ5試合＋Deep 2試合・未使用分は最大2試合振替・毎月自動更新`);
  params.set("custom_text[submit][message]", "1日12回まで。失敗・判定保留は試合枠を消費しません。購入後のお客様都合の返金はありません。サービス未提供等は販売条件に従います。");
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
  params.set("success_url", `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${origin}/pricing?checkout=cancelled`);

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

export const POST = withAuth(postHandler);
