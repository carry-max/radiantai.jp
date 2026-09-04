import {
  getStripeWebhookSecret,
  recordPaidCheckout,
  stripeWebhookConfigured,
  stripeRequest,
  type StripeCheckoutSession,
  type StripeSubscription,
  updateSubscription,
} from "@/lib/billing";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: StripeCheckoutSession | StripeSubscription | { subscription?: string | null } };
};

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((candidate) => timingSafeEqual(candidate, signature));
}

export async function POST(request: Request) {
  if (!stripeWebhookConfigured()) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!await verifyStripeSignature(payload, signature, getStripeWebhookSecret())) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as StripeEvent;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      await recordPaidCheckout(event.data.object as StripeCheckoutSession);
    } else if (["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await updateSubscription(event.data.object as StripeSubscription);
    } else if (event.type === "invoice.paid") {
      const subscriptionId = (event.data.object as { subscription?: string | null }).subscription;
      if (subscriptionId) {
        const subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
        await updateSubscription(subscription);
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("stripe webhook failed", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
