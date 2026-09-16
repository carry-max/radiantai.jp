import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { after, beforeEach, afterEach } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

globalThis.__AUTH_TEST_ENV__ = {};
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  configFile: false, root, appType: "custom", resolve: { alias: { "@": root } },
  plugins: [{ name: "auth-test-env", resolveId(id) { if (id === "@/lib/runtime-env" || id.replaceAll("\\", "/").match(/\/lib\/runtime-env(?:\.ts)?$/)) return "\0auth-env"; }, load(id) { if (id === "\0auth-env" || id.replaceAll("\\","/").endsWith("/lib/runtime-env.ts")) return "export const env = globalThis.__AUTH_TEST_ENV__"; } }],
  server: { middlewareMode: true, hmr: false },
});
const auth = await vite.ssrLoadModule("/lib/supabase-auth.ts");
const siteUser = await vite.ssrLoadModule("/lib/site-user.ts");
const accounts = await vite.ssrLoadModule("/lib/auth-accounts.ts");
const storage = await vite.ssrLoadModule("/lib/account-storage.ts");
const sessionRoute = await vite.ssrLoadModule("/app/auth/session/route.ts");
const startRoute = await vite.ssrLoadModule("/app/auth/start/route.ts");
const callbackRoute = await vite.ssrLoadModule("/app/auth/callback/route.ts");
const signoutRoute = await vite.ssrLoadModule("/app/auth/signout/route.ts");
const importRoute = await vite.ssrLoadModule("/app/auth/import-history/route.ts");
const riotAuth = await vite.ssrLoadModule("/lib/riot-auth.ts");
const riotStartRoute = await vite.ssrLoadModule("/app/auth/riot/start/route.ts");
const missionsRoute = await vite.ssrLoadModule("/app/api/missions/route.ts");
const growthRoute = await vite.ssrLoadModule("/app/api/player-growth/route.ts");
const migrations = await Promise.all((await readdir(new URL("../drizzle/", import.meta.url))).filter(name => name.endsWith(".sql")).sort().map(name => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")));
const origin = "https://review.test";
const supabaseUrl = "https://auth-unit.supabase.co";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
let db, calls, codes, tokens, refreshes;
const realFetch = globalThis.fetch;
after(async () => { await vite.close(); globalThis.fetch = realFetch; delete globalThis.__AUTH_TEST_ENV__; });

function database() {
  const sqlite = new DatabaseSync(":memory:"); migrations.forEach(sql => sqlite.exec(sql));
  return {
    sqlite,
    prepare(sql) {
      function statement(values) { return {
        bind(...next) { return statement(next); },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async raw() { const query = sqlite.prepare(sql); query.setReturnArrays(true); return query.all(...values); },
        run() { return sqlite.prepare(sql).run(...values); },
      }; }
      return statement([]);
    },
    async batch(statements) { sqlite.exec("BEGIN"); try { const out = statements.map(s => s.run()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } },
  };
}
function user(id, provider = "google", metadata = {}) { return { id, aud: "authenticated", role: "authenticated", email: `${id === a ? "a" : "b"}@example.test`, email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider, providers: [provider] }, user_metadata: { name: "テストプレイヤー", ...metadata }, identities: [{ id: `identity-${id}`, user_id: id, provider }], created_at: "2026-01-01T00:00:00Z", is_anonymous: false }; }
const encode = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function makeSession(id, { expired = false, provider = "google", metadata = {} } = {}) {
  const person = user(id, provider, metadata);
  const expires_at = Math.floor(Date.now() / 1000) + (expired ? -100 : 3600);
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: expires_at, aud: "authenticated", role: "authenticated", session_id: `session-${id}` })}.${encode(`test-signature-${id}`)}`;
  const session = { access_token, refresh_token: `refresh-${id}`, expires_in: 3600, expires_at, token_type: "bearer", user: person };
  tokens.set(access_token, person);
  return session;
}
function cookie(session) { return `${auth.authCookieName()}=base64-${encode(session)}`; }
function request(path, { cookie: sessionCookie, legacy, expected, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (sessionCookie) headers.set("Cookie", sessionCookie);
  if (legacy) { headers.set("oai-authenticated-user-id", legacy); headers.set("oai-authenticated-user-email", "a@example.test"); }
  if (expected) headers.set("X-Radiant-Account", expected);
  return new Request(`${origin}${path}`, { ...options, headers });
}
function form(path, values, extras = {}) { return request(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin }, body: new URLSearchParams(values), ...extras }); }
function cookiesFrom(response, previous = "") {
  const jar = new Map(previous.split("; ").filter(Boolean).map(part => { const equal = part.indexOf("="); return [part.slice(0, equal), part.slice(equal + 1)]; }));
  for (const value of response.headers.getSetCookie()) { const pair = value.split(";", 1)[0]; const equal = pair.indexOf("="); const name = pair.slice(0, equal); if (/Max-Age=0/i.test(value)) jar.delete(name); else jar.set(name, pair.slice(equal + 1)); }
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

beforeEach(() => {
  db = database(); calls = []; codes = new Map(); tokens = new Map(); refreshes = new Map();
  Object.keys(globalThis.__AUTH_TEST_ENV__).forEach(key => delete globalThis.__AUTH_TEST_ENV__[key]);
  Object.assign(globalThis.__AUTH_TEST_ENV__, { DB: db, SUPABASE_URL: supabaseUrl, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit_test", AUTH_SITE_URL: origin });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url || String(input));
    assert.equal(url.origin, supabaseUrl, "unit tests must never contact a live service");
    const headers = new Headers(init.headers); const authorization = headers.get("authorization");
    calls.push({ path: url.pathname, query: url.searchParams, authorization, body: init.body });
    if (url.pathname === "/auth/v1/user") {
      const person = tokens.get(authorization?.replace(/^Bearer /, ""));
      return person ? Response.json(person) : Response.json({ code: "bad_jwt", msg: "invalid token" }, { status: 401 });
    }
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse(init.body);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const session = refreshes.get(body.refresh_token);
        return session ? Response.json(session) : Response.json({ code: "refresh_token_not_found", msg: "missing refresh" }, { status: 400 });
      }
      const record = codes.get(body.auth_code);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.code_verifier || ""));
      if (!record || Buffer.from(digest).toString("base64url") !== record.challenge) return Response.json({ code: "bad_code_verifier", msg: "private provider detail" }, { status: 400 });
      codes.delete(body.auth_code);
      return Response.json(record.session);
    }
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/auth/v1/user/identities/authorize") {
      if (!tokens.has(authorization?.replace(/^Bearer /, ""))) return Response.json({ msg: "unauthorized" }, { status: 401 });
      return Response.json({ url: `${supabaseUrl}/auth/v1/authorize?provider=${url.searchParams.get("provider")}` });
    }
    throw new Error(`Unexpected test URL: ${url.pathname}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; db.sqlite.close(); });

test("Supabase mode never accepts the legacy header, missing sessions, or forged cookie identities", async () => {
  const missing = await sessionRoute.GET(request("/auth/session", { legacy: "legacy-owner" }));
  assert.equal((await missing.json()).user, null);
  const session = makeSession(b); session.user = user(a); // untrusted cookie claims someone else
  const response = await sessionRoute.GET(request("/auth/session", { cookie: cookie(session), legacy: "legacy-owner" }));
  const result = await response.json();
  const bId = await accounts.resolveAccount(db, await accounts.authSubject(supabaseUrl, b));
  assert.equal(result.user.id, bId); assert.equal(result.user.email, "b@example.test"); assert.notEqual(result.user.id, "legacy-owner");
  tokens.delete(session.access_token);
  const rejected = await missionsRoute.GET(request("/api/missions", { cookie: cookie(session), legacy: "legacy-owner" }));
  assert.equal(rejected.status, 401);
  assert.match(response.headers.get("Cache-Control"), /private, no-store/); assert.match(response.headers.get("Vary"), /Cookie/);
  assert.doesNotMatch(JSON.stringify(result), /access_token|refresh_token|sb_publishable/);
});

test("both providers use server PKCE; callback requires the same browser and a single-use code", async () => {
  for (const provider of ["google", "x"]) {
    const started = await startRoute.POST(form("/auth/start", { provider, intent: "login" }));
    assert.equal(started.status, 303);
    const authorization = new URL(started.headers.get("Location"));
    assert.equal(authorization.searchParams.get("provider"), provider);
    assert.equal(authorization.searchParams.get("redirect_to"), `${origin}/auth/callback`);
    assert.equal(authorization.searchParams.get("code_challenge_method"), "s256");
    const verifierCookies = started.headers.getSetCookie();
    assert.ok(verifierCookies.length); verifierCookies.forEach(value => { assert.match(value, /HttpOnly/); assert.match(value, /Secure/); assert.match(value, /SameSite=Lax/i); assert.match(value, /Max-Age=600/); });
    const code = `code-${provider}`; const session = makeSession(provider === "google" ? a : b, { provider });
    codes.set(code, { challenge: authorization.searchParams.get("code_challenge"), session });
    const noVerifier = await callbackRoute.GET(request(`/auth/callback?code=${code}`));
    assert.match(noVerifier.headers.get("Location"), /status=expired/);
    const finished = await callbackRoute.GET(request(`/auth/callback?code=${code}`, { cookie: cookiesFrom(started) }));
    assert.equal(finished.status, 303); assert.match(finished.headers.get("Location"), /status=signed-in/);
    const current = await sessionRoute.GET(request("/auth/session", { cookie: cookiesFrom(finished, cookiesFrom(started)) }));
    assert.deepEqual((await current.json()).user.providers, [provider]);
    const replay = await callbackRoute.GET(request(`/auth/callback?code=${code}`, { cookie: cookiesFrom(started) }));
    assert.match(replay.headers.get("Location"), /status=expired/);
  }
});

test("refresh writes every secure cookie chunk and keeps bearer tokens out of JSON", async () => {
  const expired = makeSession(a, { expired: true });
  const updated = makeSession(a, { metadata: { biography: "a".repeat(9000) } });
  refreshes.set(expired.refresh_token, updated);
  const response = await sessionRoute.GET(request("/auth/session", { cookie: cookie(expired) }));
  assert.equal(response.status, 200);
  assert.ok(calls.some(call => call.query.get("grant_type") === "refresh_token"));
  const chunks = response.headers.getSetCookie().filter(value => !/Max-Age=0/.test(value));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) { assert.match(chunk, /HttpOnly/); assert.match(chunk, /Secure/); assert.match(chunk, /Path=\//); assert.doesNotMatch(chunk, /Domain=/); }
  const body = await response.json(); assert.equal(body.user.email, "a@example.test"); assert.doesNotMatch(JSON.stringify(body), /refresh_token|access_token|biography/);
  const again = await sessionRoute.GET(request("/auth/session", { cookie: cookiesFrom(response, cookie(expired)) }));
  assert.equal((await again.json()).user.id, body.user.id);
});

test("signout is POST-only, same-origin, clears cookies and cannot fall back to ChatGPT", async () => {
  const session = makeSession(a); const sessionCookie = cookie(session);
  const initial = await (await sessionRoute.GET(request("/auth/session", { cookie: sessionCookie }))).json();
  assert.equal(signoutRoute.GET, undefined);
  const crossSite = await signoutRoute.POST(form("/auth/signout", { account: initial.user.id }, { cookie: sessionCookie, headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://attacker.test" } }));
  assert.equal(crossSite.status, 403);
  const done = await signoutRoute.POST(form("/auth/signout", { account: initial.user.id }, { cookie: sessionCookie }));
  assert.match(done.headers.get("Location"), /status=signed-out/);
  assert.ok(done.headers.getSetCookie().some(value => /Max-Age=0/.test(value)));
  assert.equal(calls.find(call => call.path === "/auth/v1/logout").query.get("scope"), "local");
  assert.equal((await (await sessionRoute.GET(request("/auth/session", { cookie: cookiesFrom(done, sessionCookie), legacy: "legacy-owner" }))).json()).user, null);
});

test("OAuth forms reject CSRF, old provider identifiers and account-switch linking", async () => {
  assert.equal((await startRoute.POST(form("/auth/start", { provider: "google" }, { headers: { "Content-Type": "application/x-www-form-urlencoded" } }))).status, 403);
  assert.match((await startRoute.POST(form("/auth/start", { provider: "twitter" }))).headers.get("Location"), /invalid-provider/);
  const sessionCookie = cookie(makeSession(a));
  const current = await (await sessionRoute.GET(request("/auth/session", { cookie: sessionCookie }))).json();
  const wrong = await startRoute.POST(form("/auth/start", { provider: "x", intent: "link", account: "another-user" }, { cookie: sessionCookie }));
  assert.match(wrong.headers.get("Location"), /account-changed/);
  const linked = await startRoute.POST(form("/auth/start", { provider: "x", intent: "link", account: current.user.id }, { cookie: sessionCookie }));
  assert.equal(linked.status, 303); assert.match(linked.headers.get("Location"), /provider=x/);
  assert.ok(calls.some(call => call.path === "/auth/v1/user/identities/authorize"));
  const failed = await callbackRoute.GET(request("/auth/callback?error=denied&error_description=private-secret"));
  assert.match(failed.headers.get("Location"), /cancelled/); assert.doesNotMatch(failed.headers.get("Location"), /private-secret/);
});

test("signout still removes browser sessions when the identity service is unavailable", async () => {
  const sessionCookie = cookie(makeSession(a));
  globalThis.fetch = async () => Response.json({ msg: "identity service unavailable" }, { status: 503 });
  const done = await signoutRoute.POST(form("/auth/signout", { account: "previously-verified-account" }, { cookie: sessionCookie }));
  assert.equal(done.status, 303);
  assert.match(done.headers.get("Location"), /status=signed-out-local/);
  assert.equal(cookiesFrom(done, sessionCookie), "");
});

test("separate users cannot read each other's records or write from an old account tab", async () => {
  const aCookie = cookie(makeSession(a)), bCookie = cookie(makeSession(b));
  const aId = (await (await sessionRoute.GET(request("/auth/session", { cookie: aCookie }))).json()).user.id;
  const bId = (await (await sessionRoute.GET(request("/auth/session", { cookie: bCookie }))).json()).user.id;
  assert.notEqual(aId, bId);
  db.sqlite.prepare("INSERT INTO player_growth_records (id,user_id,source,recorded_at,label,note,ratings_json) VALUES (?,?, 'self', ?, 'private label','private note','[]')").run(crypto.randomUUID(), aId, new Date().toISOString());
  const other = await growthRoute.GET(request("/api/player-growth", { cookie: bCookie, expected: bId }));
  assert.deepEqual((await other.json()).records, []);
  let reached = 0;
  const write = siteUser.withAuth(async () => { reached++; return Response.json({ ok: true }); });
  const stale = await write(request("/api/test", { method: "POST", cookie: bCookie, expected: aId }));
  assert.equal(stale.status, 409); assert.equal((await stale.json()).accountChanged, true); assert.equal(reached, 0);
  const valid = await write(request("/api/test", { method: "POST", cookie: bCookie, expected: bId }));
  assert.equal(valid.status, 200); assert.equal(reached, 1);
  assert.ok(db.sqlite.prepare("SELECT locked_at FROM auth_accounts WHERE user_id=?").get(bId).locked_at);
});

test("legacy import requires both identities and preserves the original ownership key", async () => {
  const aCookie = cookie(makeSession(a));
  const initial = await (await sessionRoute.GET(request("/auth/session", { cookie: aCookie, legacy: "legacy-owner" }))).json();
  db.sqlite.prepare("INSERT INTO monthly_mission_cycles (id,user_id,started_at,ends_at,baseline_focus,tasks_json,current_step,xp) VALUES ('cycle', 'legacy-owner', ?, ?, 'focus','[]',1,50)").run(new Date().toISOString(), new Date(Date.now()+86400000).toISOString());
  const withoutLegacy = await importRoute.POST(form("/auth/import-history", { account: initial.user.id }, { cookie: aCookie }));
  assert.match(withoutLegacy.headers.get("Location"), /account-changed/);
  const withoutSupabase = await importRoute.POST(form("/auth/import-history", { account: initial.user.id }, { legacy: "legacy-owner" }));
  assert.match(withoutSupabase.headers.get("Location"), /account-changed/);
  const imported = await importRoute.POST(form("/auth/import-history", { account: initial.user.id }, { cookie: aCookie, legacy: "legacy-owner" }));
  assert.match(imported.headers.get("Location"), /status=imported/);
  const afterImport = await (await sessionRoute.GET(request("/auth/session", { cookie: aCookie, legacy: "legacy-owner" }))).json();
  assert.equal(afterImport.user.id, "legacy-owner"); assert.equal(afterImport.canImportDeviceHistory, true);
  assert.equal(db.sqlite.prepare("SELECT xp FROM monthly_mission_cycles WHERE user_id='legacy-owner'").get().xp, 50);
  const bSubject = await accounts.authSubject(supabaseUrl, b);
  assert.equal(await accounts.importLegacyAccount(db, bSubject, "legacy-owner"), "conflict");
});

test("once product work starts, import cannot orphan pending payments or in-flight writes", async () => {
  const subject = await accounts.authSubject(supabaseUrl, a); const id = await accounts.resolveAccount(db, subject);
  assert.equal(await accounts.pinAccount(db, subject, id), true);
  assert.equal(await accounts.importLegacyAccount(db, subject, "legacy-a"), "conflict");
  const bSubject = await accounts.authSubject(supabaseUrl, b); const bId = await accounts.resolveAccount(db, bSubject);
  assert.equal(await accounts.importLegacyAccount(db, bSubject, "legacy-b"), "imported");
  assert.equal(await accounts.pinAccount(db, bSubject, bId), false, "an already-resolved request must stop after import changes its ID");
  assert.equal(await accounts.pinAccount(db, bSubject, "legacy-b"), true);
});

test("partial or unsafe configuration fails closed; absent configuration preserves existing login", async () => {
  delete globalThis.__AUTH_TEST_ENV__.SUPABASE_PUBLISHABLE_KEY;
  assert.equal((await sessionRoute.GET(request("/auth/session", { legacy: "owner" }))).status, 503);
  globalThis.__AUTH_TEST_ENV__.SUPABASE_PUBLISHABLE_KEY = "sb_secret_do_not_use";
  assert.equal((await sessionRoute.GET(request("/auth/session", { legacy: "owner" }))).status, 503);
  delete globalThis.__AUTH_TEST_ENV__.SUPABASE_PUBLISHABLE_KEY; delete globalThis.__AUTH_TEST_ENV__.SUPABASE_URL;
  const current = await (await sessionRoute.GET(request("/auth/session", { legacy: "owner" }))).json();
  assert.equal(current.mode, "chatgpt"); assert.equal(current.user.id, "owner"); assert.equal(current.configured, false);
});

test("Riot RSO stays closed before approval and starts a server-side PKCE flow after configuration", async () => {
  const sessionCookie = cookie(makeSession(a));
  const current = await (await sessionRoute.GET(request("/auth/session", { cookie: sessionCookie }))).json();
  const pending = await riotStartRoute.POST(form("/auth/riot/start", { account: current.user.id }, { cookie: sessionCookie }));
  assert.match(pending.headers.get("Location"), /status=riot-pending/);
  Object.assign(globalThis.__AUTH_TEST_ENV__, {
    RIOT_PRODUCT_APPROVED: "true",
    RIOT_RSO_CLIENT_ID: "riot-client",
    RIOT_RSO_CLIENT_SECRET: "server-secret",
    RIOT_RSO_AUTHORIZE_URL: "https://auth.riotgames.test/authorize",
    RIOT_RSO_TOKEN_URL: "https://auth.riotgames.test/token",
    RIOT_RSO_USERINFO_URL: "https://auth.riotgames.test/userinfo",
    RIOT_RSO_SCOPES: "openid",
  });
  assert.ok(await riotAuth.startRiotFlow(current.user.id));
  const started = await riotStartRoute.POST(form("/auth/riot/start", { account: current.user.id }, { cookie: sessionCookie }));
  assert.equal(started.status, 303, await started.clone().text());
  const destination = new URL(started.headers.get("Location"));
  assert.equal(destination.origin, "https://auth.riotgames.test");
  assert.equal(destination.searchParams.get("client_id"), "riot-client");
  assert.equal(destination.searchParams.get("redirect_uri"), `${origin}/auth/riot/callback`);
  assert.equal(destination.searchParams.get("code_challenge_method"), "S256");
  assert.ok(destination.searchParams.get("state"));
  assert.ok(destination.searchParams.get("code_challenge"));
  const flowCookie = started.headers.getSetCookie().find(value => value.includes("rr-riot-flow="));
  assert.match(flowCookie, /HttpOnly/); assert.match(flowCookie, /Secure/); assert.match(flowCookie, /SameSite=Lax/i); assert.match(flowCookie, /Max-Age=600/);
  assert.doesNotMatch(flowCookie, /server-secret/);
});

test("standard Next.js public Supabase variables configure authentication", () => {
  Object.keys(globalThis.__AUTH_TEST_ENV__).forEach(key => delete globalThis.__AUTH_TEST_ENV__[key]);
  Object.assign(globalThis.__AUTH_TEST_ENV__, {
    STANDARD_NEXT_RUNTIME: "true",
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_unit_test",
    NEXT_PUBLIC_SITE_URL: origin,
  });
  const config = auth.authConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.configured, true);
  assert.equal(config.url, supabaseUrl);
  assert.equal(config.key, "sb_publishable_unit_test");
  assert.equal(config.origin, origin);
});

test("old local reports require explicit import and cannot overwrite another account's data", () => {
  const values = new Map(); const local = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  values.set(storage.LEGACY_HISTORY_KEY, JSON.stringify([{ review: "old report" }]));
  assert.notEqual(storage.accountStorageKeys("a").history, storage.accountStorageKeys("b").history);
  assert.equal(local.getItem(storage.accountStorageKeys("a").history), null);
  assert.equal(storage.importDeviceHistory(local, "a"), true);
  assert.equal(local.getItem(storage.accountStorageKeys("b").history), null);
  assert.equal(local.getItem(storage.LEGACY_HISTORY_KEY), null);
  values.set(storage.LEGACY_HISTORY_KEY, JSON.stringify([{ review: "different report" }]));
  assert.throws(() => storage.importDeviceHistory(local, "a"), /上書きせず/);
  assert.match(local.getItem(storage.accountStorageKeys("a").history), /old report/);
});
