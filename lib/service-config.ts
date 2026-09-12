import { env } from "@/lib/runtime-env";

type ServiceEnv = {
  OPENAI_API_KEY?: string; OPENAI_REVIEW_MODEL?: string; REVIEW_DAILY_LIMIT?: string;
  PAYPAY_ENABLED?: string; RIOT_PRODUCT_APPROVED?: string;
  MERCHANT_NAME?: string; MERCHANT_REPRESENTATIVE?: string; MERCHANT_ADDRESS?: string;
  MERCHANT_PHONE?: string; SUPPORT_EMAIL?: string;
};

export function serviceConfig() {
  const values = env as unknown as ServiceEnv;
  const dailyLimit = Number(values.REVIEW_DAILY_LIMIT || 200);
  return {
    apiKey: values.OPENAI_API_KEY?.trim() || "",
    model: values.OPENAI_REVIEW_MODEL?.trim() || "gpt-5.6-luna",
    dailyLimit: Number.isInteger(dailyLimit) && dailyLimit > 0 ? Math.min(dailyLimit, 10000) : 200,
    paypayEnabled: values.PAYPAY_ENABLED === "true", riotApproved: values.RIOT_PRODUCT_APPROVED === "true",
    merchant: {
      name: values.MERCHANT_NAME?.trim() || "", representative: values.MERCHANT_REPRESENTATIVE?.trim() || "",
      address: values.MERCHANT_ADDRESS?.trim() || "", phone: values.MERCHANT_PHONE?.trim() || "", email: values.SUPPORT_EMAIL?.trim() || "",
    },
  };
}
export function merchantConfigured() { return Object.values(serviceConfig().merchant).every(Boolean); }
export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
