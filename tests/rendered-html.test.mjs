import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const env = globalThis.__TEST_CLOUDFLARE_ENV__ ?? {};",
      };
    }
    return nextResolve(specifier, context);
  },
});

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /RADIANT REVIEW/);
  assert.match(html, /次の成長/);
  assert.match(html, /無料で分析を試す/);
  assert.match(html, /成長グラフを見る/);
  assert.match(html, /立ち回り分析/);
  assert.match(html, /AIM分析/);
  assert.match(html, /Reviewは900円で5試合/);
  assert.match(html, /Climbは1,800円で10試合/);
  for (const [path, expected] of [["/analysis", /録画をドロップ/], ["/dashboard", /成長の現在地/], ["/pricing", /プレイ量に合わせた/], ["/login", /Googleでログイン[\s\S]*X（Twitter）でログイン/], ["/legal", /特定商取引法に基づく表記/], ["/privacy", /動画全体・音声は送信せず/]]) {
    const page = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} });
    assert.equal(page.status, 200); assert.match(await page.text(), expected);
  }
  const oldAccount = await worker.fetch(new Request("http://localhost/account", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.ok([307, 308].includes(oldAccount.status));
  assert.equal(new URL(oldAccount.headers.get("location"), "http://localhost").pathname, "/login");

  const authSession = await worker.fetch(new Request("http://localhost/auth/session"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} });
  assert.equal(authSession.status, 200);
  assert.equal((await authSession.json()).configured, false);
  assert.match(authSession.headers.get("Cache-Control"), /private, no-store/);
  const authStart = await worker.fetch(new Request("http://localhost/auth/start", { method: "POST" }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} });
  assert.equal(authStart.status, 303);
  assert.match(authStart.headers.get("Location"), /status=setup/);

  const invalidAnalyzeResponse = await worker.fetch(
    new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frames: [] }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(invalidAnalyzeResponse.status, 503);
  assert.match(
    (await invalidAnalyzeResponse.json()).error,
    /準備中/,
  );

  const unconfiguredCheckoutResponse = await worker.fetch(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-id": "test-user",
        "oai-authenticated-user-email": "test@example.com",
      },
      body: JSON.stringify({ plan: "climb_paypay_30day" }),
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(unconfiguredCheckoutResponse.status, 503);
  assert.match(
    (await unconfiguredCheckoutResponse.json()).error,
    /有料プランは販売準備中/,
  );
});
