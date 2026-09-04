import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(html, /最大60分/);
  assert.match(html, /動画は端末内で処理/);
  assert.match(html, /前20秒〜後5秒/);
  assert.match(html, /デス地点を自動検出/);
  assert.match(html, /追加API料金はありません/);
  assert.match(html, /全ユーザー利用可/);
  assert.match(html, /複数試合比較/);
  assert.match(html, /苦手マップ・エージェント/);
  assert.match(html, /反省点の推移・過去比較/);
  assert.doesNotMatch(html, /CLIMB/);
  assert.match(html, /<kbd>D<\/kbd>/);

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

  assert.equal(invalidAnalyzeResponse.status, 400);
  assert.match(
    (await invalidAnalyzeResponse.json()).error,
    /APIキー/,
  );
});
