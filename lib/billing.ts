import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { billingEntitlements, billingPayments } from "@/db/schema";

export const PAYPAY_ACCESS_DAYS = 30;

export type BillingPlan =
  | "card_monthly"
  | "paypay_30day"
  | "climb_card_monthly"
  | "climb_paypay_30day";

export type BillingTier = "review" | "climb";

export type BillingPlanDetails = {
  tier: BillingTier;
  tierLabel: "Review" | "Climb";
  paymentMethod: "card" | "paypay";
  priceYen: number;
  analysisCredits: number;
  productName: string;
};

export const BILLING_PLAN_DETAILS: Record<BillingPlan, BillingPlanDetails> = {
  card_monthly: {
    tier: "review",
    tierLabel: "Review",
    paymentMethod: "card",
    priceYen: 900,
    analysisCredits: 5,
    productName: "Radiant Review Review 月額プラン",
  },
  paypay_30day: {
    tier: "review",
    tierLabel: "Review",
    paymentMethod: "paypay",
    priceYen: 900,
    analysisCredits: 5,
    productName: "Radiant Review Review 30日パス",
  },
  climb_card_monthly: {
    tier: "climb",
    tierLabel: "Climb",
    paymentMethod: "card",
    priceYen: 1_800,
    analysisCredits: 10,
    productName: "Radiant Review Climb 月額プラン",
  },
  climb_paypay_30day: {
    tier: "climb",
    tierLabel: "Climb",
    paymentMethod: "paypay",
    priceYen: 1_800,
    analysisCredits: 10,
    productName: "Radiant Review Climb 30日パス",
  },
};

export function getBillingPlanDetails(value: unknown) {
  if (typeof value !== "string" || !(value in BILLING_PLAN_DETAILS)) return null;
  return BILLING_PLAN_DETAILS[value as BillingPlan];
}

type RuntimeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type StripeCheckoutSession = {
  id: string;
  client_reference_id?: string | null;
  created?: number;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
  mode?: "payment" | "subscription" | string;
  payment_status?: "paid" | "unpaid" | "no_payment_required" | string;
  status?: "open" | "complete" | "expired" | string;
  subscription?: string | StripeSubscription | null;
};

export type StripeSubscription = {
  id: string;
  current_period_end?: number;
  current_period_start?: number;
  metadata?: Record<string, string> | null;
  status?: string;
};

export type BillingEntitlement = {
  plan: BillingPlan;
  status: "active" | "inactive";
  startsAt: string;
  endsAt: string;
  remainingDays: number;
};

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function stripeCheckoutConfigured() {
  return Boolean(runtimeEnv().STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookConfigured() {
  return Boolean(runtimeEnv().STRIPE_WEBHOOK_SECRET?.trim());
}

export function getStripeWebhookSecret() {
  return runtimeEnv().STRIPE_WEBHOOK_SECRET?.trim() || "";
}

export async function stripeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = runtimeEnv().STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("BILLING_NOT_CONFIGURED");

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    const message = payload.error?.message || "Stripeとの通信に失敗しました。";
    throw new Error(`STRIPE_ERROR:${message}`);
  }
  return payload;
}

function remainingDays(endsAt: string) {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

export function publicEntitlement(row: typeof billingEntitlements.$inferSelect | undefined): BillingEntitlement | null {
  if (!row) return null;
  const active = row.status === "active" && new Date(row.endsAt).getTime() > Date.now();
  return {
    plan: row.plan as BillingPlan,
    status: active ? "active" : "inactive",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    remainingDays: active ? remainingDays(row.endsAt) : 0,
  };
}

export async function getEntitlement(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(billingEntitlements)
    .where(eq(billingEntitlements.userId, userId))
    .limit(1);
  return publicEntitlement(row);
}

function sessionPlan(session: StripeCheckoutSession): BillingPlan | null {
  const value = session.metadata?.plan;
  if (getBillingPlanDetails(value)) return value as BillingPlan;
  return session.mode === "subscription" ? "card_monthly" : null;
}

function subscriptionFromSession(session: StripeCheckoutSession) {
  return typeof session.subscription === "object" && session.subscription
    ? session.subscription
    : null;
}

export async function recordPaidCheckout(session: StripeCheckoutSession) {
  const userId = session.client_reference_id || session.metadata?.user_id || "";
  const plan = sessionPlan(session);
  if (!userId || !plan) throw new Error("INVALID_CHECKOUT_SESSION");
  const planDetails = BILLING_PLAN_DETAILS[plan];
  const payPay = planDetails.paymentMethod === "paypay";
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    return { state: "processing" as const, entitlement: await getEntitlement(userId) };
  }

  const db = getDb();
  const [existingPayment] = await db
    .select({ id: billingPayments.checkoutSessionId })
    .from(billingPayments)
    .where(eq(billingPayments.checkoutSessionId, session.id))
    .limit(1);
  if (existingPayment) {
    return { state: "active" as const, entitlement: await getEntitlement(userId) };
  }

  const now = new Date();
  const [current] = await db
    .select()
    .from(billingEntitlements)
    .where(eq(billingEntitlements.userId, userId))
    .limit(1);
  const subscription = subscriptionFromSession(session);
  const startsAt = payPay
    ? new Date(Math.max(now.getTime(), current?.status === "active" ? new Date(current.endsAt).getTime() : 0))
    : new Date((subscription?.current_period_start || session.created || Math.floor(now.getTime() / 1000)) * 1000);
  const endsAt = payPay
    ? new Date(startsAt.getTime() + PAYPAY_ACCESS_DAYS * 86_400_000)
    : new Date((subscription?.current_period_end || Math.floor(now.getTime() / 1000) + 31 * 86_400) * 1000);
  const email = session.customer_details?.email || current?.email || "";
  const paidAt = new Date((session.created || Math.floor(now.getTime() / 1000)) * 1000).toISOString();
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : subscription?.id || null;

  await db.batch([
    db.insert(billingPayments).values({
      checkoutSessionId: session.id,
      userId,
      email,
      plan,
      amountYen: planDetails.priceYen,
      paidAt,
    }).onConflictDoNothing(),
    db.insert(billingEntitlements).values({
      userId,
      email,
      plan,
      status: "active",
      paymentProvider: "stripe",
      checkoutSessionId: session.id,
      subscriptionId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      updatedAt: now.toISOString(),
    }).onConflictDoUpdate({
      target: billingEntitlements.userId,
      set: {
        email,
        plan,
        status: "active",
        checkoutSessionId: session.id,
        subscriptionId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        updatedAt: now.toISOString(),
      },
    }),
  ]);

  return { state: "active" as const, entitlement: await getEntitlement(userId) };
}

export async function updateSubscription(subscription: StripeSubscription) {
  const userId = subscription.metadata?.user_id || "";
  if (!userId) return;
  const db = getDb();
  const [current] = await db
    .select()
    .from(billingEntitlements)
    .where(eq(billingEntitlements.userId, userId))
    .limit(1);
  if (!current) return;

  const activeStatuses = new Set(["active", "trialing", "past_due"]);
  const status = activeStatuses.has(subscription.status || "") ? "active" : "inactive";
  const endsAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : current.endsAt;
  await db.update(billingEntitlements).set({
    status,
    subscriptionId: subscription.id,
    endsAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(billingEntitlements.userId, userId));
}
