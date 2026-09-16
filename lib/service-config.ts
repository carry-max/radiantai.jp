import { env } from "@/lib/runtime-env";

type ServiceEnv = {
  OPENAI_API_KEY?: string; OPENAI_REVIEW_MODEL?: string; REVIEW_DAILY_LIMIT?: string;
  VIDEO_ANALYSIS_BACKEND_URL?: string; VIDEO_ANALYSIS_BACKEND_TOKEN?: string;
  PAYPAY_ENABLED?: string; RIOT_PRODUCT_APPROVED?: string;
  RIOT_RSO_CLIENT_ID?: string; RIOT_RSO_CLIENT_SECRET?: string;
  RIOT_RSO_AUTHORIZE_URL?: string; RIOT_RSO_TOKEN_URL?: string; RIOT_RSO_USERINFO_URL?: string;
  RIOT_RSO_SCOPES?: string;
  MERCHANT_NAME?: string; MERCHANT_REPRESENTATIVE?: string; MERCHANT_ADDRESS?: string;
  MERCHANT_PHONE?: string; SUPPORT_EMAIL?: string;
};

function secureUrl(value?: string) {
  try {
    const url = new URL(value?.trim() || "");
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch { return ""; }
}

export function serviceConfig() {
  const values = env as unknown as ServiceEnv;
  const dailyLimit = Number(values.REVIEW_DAILY_LIMIT || 200);
  return {
    apiKey: values.OPENAI_API_KEY?.trim() || "",
    model: values.OPENAI_REVIEW_MODEL?.trim() || "gpt-5.6-luna",
    videoBackendUrl: values.VIDEO_ANALYSIS_BACKEND_URL?.trim().replace(/\/$/, "") || "",
    videoBackendToken: values.VIDEO_ANALYSIS_BACKEND_TOKEN?.trim() || "",
    dailyLimit: Number.isInteger(dailyLimit) && dailyLimit > 0 ? Math.min(dailyLimit, 10000) : 200,
    paypayEnabled: values.PAYPAY_ENABLED === "true", riotApproved: values.RIOT_PRODUCT_APPROVED === "true",
    riot: {
      clientId: values.RIOT_RSO_CLIENT_ID?.trim() || "",
      clientSecret: values.RIOT_RSO_CLIENT_SECRET?.trim() || "",
      authorizeUrl: secureUrl(values.RIOT_RSO_AUTHORIZE_URL),
      tokenUrl: secureUrl(values.RIOT_RSO_TOKEN_URL),
      userInfoUrl: secureUrl(values.RIOT_RSO_USERINFO_URL),
      scopes: values.RIOT_RSO_SCOPES?.trim() || "openid",
    },
    merchant: {
      name: values.MERCHANT_NAME?.trim() || "", representative: values.MERCHANT_REPRESENTATIVE?.trim() || "",
      address: values.MERCHANT_ADDRESS?.trim() || "", phone: values.MERCHANT_PHONE?.trim() || "", email: values.SUPPORT_EMAIL?.trim() || "",
    },
  };
}
export function merchantConfigured() { return Object.values(serviceConfig().merchant).every(Boolean); }
export function riotRsoConfigured() {
  const config = serviceConfig();
  return config.riotApproved && Object.values(config.riot).every(Boolean);
}
export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
