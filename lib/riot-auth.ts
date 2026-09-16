import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { accountRedirect, authConfig } from "@/lib/supabase-auth";
import { riotRsoConfigured, serviceConfig } from "@/lib/service-config";
import type { MissionDatabase } from "@/lib/monthly-store";

const FLOW_LIFETIME_SECONDS = 10 * 60;
type Flow = { state: string; verifier: string; account: string; expires: number };
type RiotClaims = { sub?: unknown; game_name?: unknown; tag_line?: unknown; preferred_username?: unknown; name?: unknown };

function randomValue(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}
async function challenge(value: string) {
  return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("base64url");
}
function cookieName() { return authConfig().secure ? "__Host-rr-riot-flow" : "rr-riot-flow"; }
function encodeFlow(flow: Flow) { return Buffer.from(JSON.stringify(flow)).toString("base64url"); }
function flowCookie(value: string, maxAge = FLOW_LIFETIME_SECONDS) {
  return serializeCookieHeader(cookieName(), value, { path: "/", httpOnly: true, secure: authConfig().secure, sameSite: "lax", maxAge });
}
export function clearRiotFlow() { return flowCookie("", 0); }
export function readRiotFlow(request: Request): Flow | null {
  const value = parseCookieHeader(request.headers.get("cookie") || "").find(cookie => cookie.name === cookieName())?.value;
  if (!value) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Flow;
    return typeof flow.state === "string" && typeof flow.verifier === "string" && typeof flow.account === "string" && flow.expires >= Date.now() ? flow : null;
  } catch { return null; }
}
export async function startRiotFlow(account: string) {
  if (!riotRsoConfigured()) return null;
  const config = serviceConfig().riot;
  const flow: Flow = { state: randomValue(), verifier: randomValue(48), account, expires: Date.now() + FLOW_LIFETIME_SECONDS * 1000 };
  const destination = new URL(config.authorizeUrl);
  destination.searchParams.set("client_id", config.clientId);
  destination.searchParams.set("redirect_uri", `${authConfig().origin}/auth/riot/callback`);
  destination.searchParams.set("response_type", "code");
  destination.searchParams.set("scope", config.scopes);
  destination.searchParams.set("state", flow.state);
  destination.searchParams.set("code_challenge", await challenge(flow.verifier));
  destination.searchParams.set("code_challenge_method", "S256");
  return { destination, cookie: flowCookie(encodeFlow(flow)) };
}
export async function finishRiotFlow(code: string, flow: Flow): Promise<{ subject: string; displayName: string }> {
  const config = serviceConfig().riot;
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${authConfig().origin}/auth/riot/callback`, code_verifier: flow.verifier }),
  });
  if (!tokenResponse.ok) throw new Error("token exchange failed");
  const token = await tokenResponse.json() as { access_token?: unknown };
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("access token missing");
  const userResponse = await fetch(config.userInfoUrl, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error("userinfo failed");
  const claims = await userResponse.json() as RiotClaims;
  if (typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 255) throw new Error("subject missing");
  const riotId = typeof claims.game_name === "string" && typeof claims.tag_line === "string" ? `${claims.game_name}#${claims.tag_line}` : "";
  const label = riotId || (typeof claims.preferred_username === "string" ? claims.preferred_username : "") || (typeof claims.name === "string" ? claims.name : "") || "Riotプレイヤー";
  return { subject: claims.sub.trim(), displayName: label.trim().slice(0, 100) || "Riotプレイヤー" };
}
export async function getRiotConnection(db: MissionDatabase, userId: string) {
  return db.prepare("SELECT display_name, linked_at FROM riot_connections WHERE user_id = ?").bind(userId).first<{ display_name: string; linked_at: string }>();
}
export async function saveRiotConnection(db: MissionDatabase, userId: string, connection: { subject: string; displayName: string }) {
  await db.prepare(`INSERT INTO riot_connections (user_id, riot_subject, display_name, linked_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET riot_subject = excluded.riot_subject, display_name = excluded.display_name, linked_at = excluded.linked_at`)
    .bind(userId, connection.subject, connection.displayName, new Date().toISOString()).run();
}
export function riotRedirect(status: string, clear = false) {
  const response = accountRedirect(status);
  if (!clear) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearRiotFlow());
  return new Response(null, { status: response.status, headers });
}
