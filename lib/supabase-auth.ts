import { env } from "@/lib/runtime-env";
import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type AuthEnv = {
  SUPABASE_AUTH_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  AUTH_SITE_URL?: string;
};
const DEFAULT_ORIGIN = "http://localhost:3000";
export const AUTH_PROVIDERS = ["google", "x"] as const;
export type AuthProvider = typeof AUTH_PROVIDERS[number];
export class AuthUnavailable extends Error {
  constructor() { super("ログイン情報を確認できませんでした。時間をおいて再度お試しください。"); }
}

export function authConfig() {
  const values = env as unknown as AuthEnv;
  const url = values.SUPABASE_AUTH_URL?.trim()
    || values.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || values.SUPABASE_URL?.trim()
    || "";
  const key = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || values.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || values.SUPABASE_PUBLISHABLE_KEY?.trim()
    || "";
  const enabled = env.STANDARD_NEXT_RUNTIME === "true" || Boolean(url || key);
  let origin = DEFAULT_ORIGIN;
  let valid = true;
  try {
    const site = new URL(values.AUTH_SITE_URL?.trim() || values.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_ORIGIN);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
    if (site.username || site.password || site.search || site.hash || site.pathname !== "/" || (site.protocol !== "https:" && !(local && site.protocol === "http:"))) valid = false;
    origin = site.origin;
    if (url) {
      const service = new URL(url);
      const localService = local && ["localhost", "127.0.0.1", "[::1]"].includes(service.hostname);
      if (service.username || service.password || service.search || service.hash || service.pathname !== "/" || (service.protocol !== "https:" && !(localService && service.protocol === "http:"))) valid = false;
    }
  } catch { valid = false; }
  // This app never needs a service-role or secret key.
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey && key.split(".").length === 3) {
    try { publicKey = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; } catch { /* invalid configuration */ }
  }
  return { enabled, configured: enabled && valid && Boolean(url) && publicKey, url: url.replace(/\/$/, ""), key, origin, secure: origin.startsWith("https:") };
}

type AuthContext = {
  client: SupabaseClient;
  jar: Map<string, string>;
  pending: Map<string, { value: string; options: CookieOptions }>;
  verified?: Promise<User | null>;
  headers: Record<string, string>;
};
const requests = new WeakMap<Request, AuthContext>();
export function authCookieName() { return authConfig().secure ? "__Host-rr-auth" : "rr-auth"; }
function ownedCookie(name: string) { const base = authCookieName(); return name === base || name.startsWith(`${base}.`) || name === `${base}-code-verifier` || name.startsWith(`${base}-code-verifier.`); }

export function getSupabase(request: Request) {
  const existing = requests.get(request);
  if (existing) return existing.client;
  const config = authConfig();
  if (!config.configured) throw new AuthUnavailable();
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") || "").map(cookie => [cookie.name, cookie.value || ""]));
  const pending: AuthContext["pending"] = new Map();
  const context = { jar, pending, headers: {} } as AuthContext;
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { name: authCookieName(), path: "/", httpOnly: true, secure: config.secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          const verifierLifetime = name.includes("-code-verifier") && value ? { maxAge: 600 } : {};
          pending.set(name, { value, options: { ...options, ...verifierLifetime, path: "/", httpOnly: true, secure: config.secure, sameSite: "lax", domain: undefined } });
        }
        Object.assign(context.headers, headers || {});
      },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal || AbortSignal.timeout(15_000) }) },
  });
  context.client = client;
  requests.set(request, context);
  return client;
}

export async function verifiedSupabaseUser(request: Request): Promise<User | null> {
  if (!authConfig().configured) throw new AuthUnavailable();
  const client = getSupabase(request);
  const context = requests.get(request)!;
  context.verified ??= (async () => {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (["AuthSessionMissingError", "AuthInvalidTokenResponseError"].includes(error.name) || [400, 401, 403].includes(error.status || 0)) return null;
      throw new AuthUnavailable();
    }
    if (!data.user || data.user.is_anonymous || !/^[0-9a-f-]{36}$/i.test(data.user.id)) return null;
    return data.user;
  })();
  return context.verified;
}

export function resetVerifiedUser(request: Request) { const context = requests.get(request); if (context) delete context.verified; }
export function clearAuthCookies(request: Request) {
  getSupabase(request);
  const context = requests.get(request)!;
  for (const name of new Set([...context.jar.keys(), ...context.pending.keys()])) {
    if (ownedCookie(name)) context.pending.set(name, { value: "", options: { path: "/", httpOnly: true, secure: authConfig().secure, sameSite: "lax", maxAge: 0 } });
  }
  resetVerifiedUser(request);
}

export function authResponse(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  const context = requests.get(request);
  for (const [name, value] of Object.entries(context?.headers || {})) headers.set(name, value);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  const vary = new Set((headers.get("Vary") || "").split(",").map(value => value.trim()).filter(Boolean));
  vary.add("Cookie"); headers.set("Vary", Array.from(vary).join(", "));
  for (const [name, { value, options }] of context?.pending || []) headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function isAuthForm(request: Request) {
  const origin = authConfig().origin;
  return request.method === "POST" && request.headers.get("origin") === origin && new URL(request.url).origin === origin;
}
export async function authForm(request: Request) {
  if (!isAuthForm(request)) return null;
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length") || 0) > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 4096) { await reader.cancel(); return null; } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new URLSearchParams(new TextDecoder().decode(bytes));
  } finally { reader.releaseLock(); }
}
export function accountRedirect(status?: string) {
  const destination = new URL("/login", authConfig().origin);
  if (status) destination.searchParams.set("status", status);
  return Response.redirect(destination, 303);
}
