import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

globalThis.__GROWTH_TEST_ENV__ = {};
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, root, appType: "custom", resolve: { alias: { "@": root } },
  plugins: [{ name: "growth-test-env", resolveId(id) { if (id === "@/lib/runtime-env" || id.replaceAll("\\", "/").match(/\/lib\/runtime-env(?:\.ts)?$/)) return "\0growth-env"; }, load(id) { if (id === "\0growth-env" || id.replaceAll("\\","/").endsWith("/lib/runtime-env.ts")) return "export const env = globalThis.__GROWTH_TEST_ENV__"; } }], server: { middlewareMode: true, hmr: false } });
after(async () => { await vite.close(); delete globalThis.__GROWTH_TEST_ENV__; });
const logic = await vite.ssrLoadModule("/lib/player-growth.ts");
const store = await vite.ssrLoadModule("/lib/player-growth-store.ts");
const api = await vite.ssrLoadModule("/app/api/player-growth/route.ts");
const migration = await readFile(new URL("../drizzle/0003_demonic_avengers.sql", import.meta.url), "utf8");
function database() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec(migration);
  return { sqlite, prepare(sql) {
    const statement = values => ({ bind(...next) { return statement(next); }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, run() { return sqlite.prepare(sql).run(...values); } });
    return statement([]);
  }, async batch(statements) { sqlite.exec("BEGIN"); try { const out = statements.map(s => s.run()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}
const rating = (skill = "aim", level = 3) => ({ skill, level, evidence: "確認", times: [] });
const draft = () => ({ id: crypto.randomUUID(), label: "射撃場", note: "初弾を確認", ratings: [{ skill: "aim", level: 3 }] });
const request = (method, user, body, origin = "https://review.test") => new Request("https://review.test/api/player-growth", { method, headers: { ...(user ? { "oai-authenticated-user-id": user } : {}), "content-type": "application/json", origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("comparison separates periods and sources, leaves missing axes empty and excludes future data", () => {
  const now = Date.parse("2026-09-09T15:00:00Z");
  const record = (daysAgo, source, skill, level) => ({ id: crypto.randomUUID(), source, recordedAt: new Date(now - daysAgo * 86400000).toISOString(), label: "", note: "", ratings: [rating(skill, level)] });
  const result = logic.growthComparison([record(1, "self", "aim", 4), record(2, "self", "aim", 2), record(8, "self", "aim", 1), record(1, "ai", "angles", 3), record(-1, "self", "aim", 5), record(16, "self", "aim", 5)], "self", 7, now);
  assert.equal(result.axes[0].current.value, 60); assert.equal(result.axes[0].current.count, 2);
  assert.equal(result.axes[0].previous.value, 20);
  assert.equal(result.axes.find(a => a.id === "angles").current.value, null);
  assert.equal(result.current.length, 2); assert.equal(result.previous.length, 1);
});

test("AI ratings require observed skills and exact evidence; static frames cannot establish mastery", () => {
  const valid = { skill: "crosshair", level: 3, evidence: "頭の高さに照準", times: [10] };
  assert.deepEqual(logic.verifiedSkillRatings([valid], [10, 20], true), [valid]);
  for (const item of [{ ...valid, skill: "aim" }, { ...valid, skill: "peek_advantage" }, { ...valid, level: 5 }, { ...valid, level: 0 }, { ...valid, times: [999] }, { ...valid, evidence: "" }, { ...valid, times: [] }]) assert.deepEqual(logic.verifiedSkillRatings([item], [10], true), []);
  assert.deepEqual(logic.verifiedSkillRatings([valid], [10], false), []);
  assert.equal(logic.verifiedSkillRatings([valid, valid], [10], true).length, 1);
});

test("all authenticated users can persist and reload self-ratings without AI or billing configuration", async () => {
  const db = database(); globalThis.__GROWTH_TEST_ENV__.DB = db;
  const body = draft();
  try {
    assert.equal((await api.POST(request("POST", "owner", body))).status, 200);
    assert.equal((await api.POST(request("POST", "owner", body))).status, 200);
    const saved = await api.GET(request("GET", "owner")); assert.match(saved.headers.get("cache-control"), /(?:^|,\s*)no-store(?:,|$)/);
    const result = await saved.json(); assert.equal(result.records.length, 1); assert.equal(result.records[0].ratings[0].level, 3); assert.equal(result.records[0].source, "self");
    assert.equal((await (await api.GET(request("GET", "other"))).json()).records.length, 0);
    assert.equal((await api.DELETE(request("DELETE", "other", { id: body.id }))).status, 404);
    assert.equal((await api.DELETE(request("DELETE", "owner", { id: body.id }))).status, 200);
    assert.equal((await store.getPlayerGrowth(db, "owner")).length, 0);
  } finally { delete globalThis.__GROWTH_TEST_ENV__.DB; db.sqlite.close(); }
});

test("forged AI data, duplicate axes, out-of-range values, cross-origin and anonymous writes are rejected", async () => {
  const body = draft();
  assert.equal((await api.POST(request("POST", "", body))).status, 401);
  assert.equal((await api.POST(request("POST", "owner", body, "https://other.test"))).status, 403);
  for (const invalid of [{ ...body, source: "ai" }, { ...body, ratings: [body.ratings[0], body.ratings[0]] }, { ...body, ratings: [{ skill: "aim", level: 6 }] }, { ...body, ratings: [{ skill: "unknown", level: 3 }] }, { ...body, ratings: [] }, null]) assert.equal((await api.POST(request("POST", "owner", invalid))).status, 400);
  assert.equal((await (await api.GET(request("GET", ""))).json()).signedIn, false);
});

test("AI recording is idempotent and cannot be deleted through self-rating controls", async () => {
  const db = database(); const ratings = [{ skill: "crosshair", level: 3, evidence: "頭の高さ", times: [10] }];
  await store.saveAiGrowth(db, "owner", "analysis-1", ratings, "Ascent");
  await store.saveAiGrowth(db, "owner", "analysis-1", ratings, "Ascent");
  await store.saveAiGrowth(db, "owner", "insufficient", [], "Ascent");
  const rows = await store.getPlayerGrowth(db, "owner"); assert.equal(rows.length, 1);
  assert.equal(await store.deleteSelfGrowth(db, "owner", rows[0].id), false);
  db.sqlite.close();
});

test("daily self-rating limit resets at midnight in Japan", async () => {
  const db = database(); const now = Date.parse("2026-09-09T14:59:59Z");
  for (let i = 0; i < 20; i++) assert.equal(await store.saveSelfGrowth(db, "owner", { ...draft(), ratings: [rating()] }, now), true);
  assert.equal(await store.saveSelfGrowth(db, "owner", { ...draft(), ratings: [rating()] }, now), false);
  assert.equal(await store.saveSelfGrowth(db, "owner", { ...draft(), ratings: [rating()] }, now + 1000), true);
  assert.equal(await store.saveSelfGrowth(db, "other", { ...draft(), ratings: [rating()] }, now), true);
  db.sqlite.close();
});
