import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

globalThis.__ANALYSIS_TEST_ENV__ = {};
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  configFile: false, root, appType: "custom", resolve: { alias: { "@": root } },
  plugins: [{ name: "analysis-test-env", resolveId(id) { if (id === "@/lib/runtime-env" || id.replaceAll("\\", "/").match(/\/lib\/runtime-env(?:\.ts)?$/)) return "\0analysis-env"; }, load(id) { if (id === "\0analysis-env" || id.replaceAll("\\","/").endsWith("/lib/runtime-env.ts")) return "export const env = globalThis.__ANALYSIS_TEST_ENV__"; } }],
  server: { middlewareMode: true, hmr: false },
});
after(async () => { await vite.close(); delete globalThis.__ANALYSIS_TEST_ENV__; });
const access = await vite.ssrLoadModule("/lib/analysis-access.ts");
const billing = await vite.ssrLoadModule("/lib/billing.ts");
const api = await vite.ssrLoadModule("/app/api/analyze/route.ts");
const modes = await vite.ssrLoadModule("/lib/review-modes.ts");
const growth = await vite.ssrLoadModule("/lib/player-growth.ts");
const feedback = await vite.ssrLoadModule("/app/api/review-feedback/route.ts");
const migrations = await Promise.all(["0000_steep_scarlet_spider.sql", "0002_goofy_rawhide_kid.sql", "0003_demonic_avengers.sql"].map(name => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")));
function database() {
  const sqlite = new DatabaseSync(":memory:");
  migrations.forEach(sql => sqlite.exec(sql));
  return {
    sqlite,
    prepare(sql) {
      function statement(values) {
        return {
          bind(...next) { return statement(next); },
          async first() { return sqlite.prepare(sql).get(...values) || null; },
          async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          async raw() { const query = sqlite.prepare(sql); query.setReturnArrays(true); return query.all(...values); },
          run() { return sqlite.prepare(sql).run(...values); },
        };
      }
      return statement([]);
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const out = statements.map(s => s.run()); sqlite.exec("COMMIT"); return out; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
async function succeed(db, user, recording, scene, entitlement = null) {
  const reserved = await access.reserveAnalysis(db, user, entitlement, recording, scene);
  if (reserved.reservation) await access.completeAnalysis(reserved.reservation, { ok: true, review: { headline: "根拠あり" } }, true, { input_tokens: 200 });
  return reserved;
}
test("trial covers one recording with three scenes; replays do not consume another slot", async () => {
  const db = database();
  for (const scene of ["10", "20", "30"]) await succeed(db, "a", "match-1", scene);
  const quota = await access.readAllowance(db, "a", null);
  assert.equal(quota.remaining, 0); assert.equal(quota.recordings[0].scenesUsed, 3);
  const replay = await access.reserveAnalysis(db, "a", null, "match-1", "10");
  assert.equal(replay.cached.cached, true); assert.equal(replay.reservation, null);
  await assert.rejects(access.reserveAnalysis(db, "a", null, "match-1", "40"), { status: 402 });
  await assert.rejects(access.reserveAnalysis(db, "a", null, "match-2", "10"), { status: 402 });
  assert.equal((await access.readAllowance(db, "b", null)).remaining, 1);
  db.sqlite.close();
});
test("failed and insufficient reviews release the lock without using a match", async () => {
  const db = database();
  const first = await access.reserveAnalysis(db, "a", null, "match-1", "10");
  await access.failAnalysis(first.reservation);
  const second = await access.reserveAnalysis(db, "a", null, "match-2", "20");
  await access.completeAnalysis(second.reservation, { ok: true }, false);
  assert.equal((await access.readAllowance(db, "a", null)).remaining, 1);
  await succeed(db, "a", "match-3", "30");
  db.sqlite.close();
});
test("concurrent requests cannot both claim the last free match", async () => {
  const db = database();
  const results = await Promise.allSettled([access.reserveAnalysis(db, "a", null, "m1", "1"), access.reserveAnalysis(db, "a", null, "m2", "1")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  await access.failAnalysis(results.find(r => r.status === "fulfilled").value.reservation);
  db.sqlite.close();
});
test("paid quotas renew with the billing period, expired/future access cannot grant paid use", async () => {
  const db = database(); const now = Date.now();
  const entitlement = { plan: "card_monthly", status: "active", startsAt: new Date(now-1000).toISOString(), endsAt: new Date(now+86400000).toISOString(), remainingDays: 1 };
  for (let i=0;i<5;i++) await succeed(db, "a", `m${i}`, "1", entitlement);
  await assert.rejects(access.reserveAnalysis(db, "a", entitlement, "m6", "1"), { status: 402 });
  assert.equal((await access.readAllowance(db, "a", {...entitlement, startsAt: new Date(now-500).toISOString(), endsAt: new Date(now+86400001).toISOString()})).remaining, 5);
  assert.equal(access.analysisPeriod({...entitlement, endsAt: new Date(now-1).toISOString()}).limit, 1);
  assert.equal(access.analysisPeriod({...entitlement, startsAt: new Date(now+1000).toISOString()}).limit, 1);
  assert.equal(access.analysisPeriod({...entitlement, plan:"climb_card_monthly"}).limit, 10);
  db.sqlite.close();
});
test("daily attempt and service budget limits also cover failures", async () => {
  const db = database();
  for(let i=0;i<12;i++) { const r=await access.reserveAnalysis(db,"a",null,"m",String(i)); await access.failAnalysis(r.reservation); }
  await assert.rejects(access.reserveAnalysis(db,"a",null,"m","13"), {status:429});
  globalThis.__ANALYSIS_TEST_ENV__.REVIEW_DAILY_LIMIT="1";
  await assert.rejects(access.reserveAnalysis(db,"b",null,"m","1"), {status:503});
  delete globalThis.__ANALYSIS_TEST_ENV__.REVIEW_DAILY_LIMIT;
  db.sqlite.close();
});
test("unconfigured service and checkout stay disabled; prototype names are not plans", async () => {
  const response = await api.POST(new Request("https://review.test/api/analyze", {method:"POST",body:JSON.stringify({frames:[]})}));
  assert.equal(response.status,503); assert.match((await response.json()).error,/準備中/);
  assert.equal(billing.salesConfigured(),false);
  assert.equal(billing.getBillingPlanDetails("toString"),null); assert.equal(billing.getBillingPlanDetails("__proto__"),null);
  const csrf=await api.POST(new Request("https://review.test/api/analyze",{method:"POST",headers:{origin:"https://other.test"},body:"{}"}));
  assert.equal(csrf.status,403);
});
test("feedback cannot modify another user's review", async () => {
  const db=database(); const r=await succeed(db,"owner","m","1"); globalThis.__ANALYSIS_TEST_ENV__.DB=db;
  const send=user=>feedback.POST(new Request("https://review.test/api/review-feedback",{method:"POST",headers:{"oai-authenticated-user-id":user},body:JSON.stringify({id:r.reservation.id,rating:"helpful"})}));
  assert.equal((await send("other")).status,404); assert.equal((await send("owner")).status,200);
  delete globalThis.__ANALYSIS_TEST_ENV__.DB; db.sqlite.close();
});

test("hosted analysis uses the service key, caches success, and rejects unsupported evidence without charging", async () => {
  const db = database();
  Object.assign(globalThis.__ANALYSIS_TEST_ENV__, {
    DB: db,
    OPENAI_API_KEY: "test-server-key",
    VIDEO_ANALYSIS_BACKEND_URL: "https://worker.test/",
    VIDEO_ANALYSIS_BACKEND_TOKEN: "test-worker-token",
  });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  let evidenceTime = 10;
  let failUpstream = false;
  const frame = time => ({ time, label: "接敵前", dataUrl: "data:image/jpeg;base64,AA==" });
  const send = scene => api.POST(new Request("https://review.test/api/analyze", {
    method: "POST", headers: { "content-type": "application/json", "oai-authenticated-user-id": "owner" },
    body: JSON.stringify({ recordingId: "a".repeat(64), deathTimestamp: scene, frames: [frame(10), frame(20)] }),
  }));
  globalThis.fetch = async (url, options) => {
    upstreamCalls++;
    assert.equal(url, "https://worker.test/v1/analyze");
    assert.equal(options.headers.Authorization, "Bearer test-worker-token");
    assert.equal(JSON.parse(options.body).request.store, false);
    if (failUpstream) return Response.json({ error: { message: "private provider error" } }, { status: 429 });
    return Response.json({ usage: { input_tokens: 123 }, output_text: JSON.stringify({
      status: "ok", headline: "遮蔽を使う", observed: ["射線に出ている"],
      evidence_frames: [{ time: evidenceTime, observation: "射線に出ている" }],
      skill_assessments: [{ skill: "positioning", level: 2, evidence: "遮蔽から離れている", times: [evidenceTime] }],
      main_issue: { category: "ポジショニング", severity: "medium", evidence: "遮蔽から離れている" },
      improvements: ["遮蔽の近くで接敵する"], next_focus: "遮蔽を使う",
      mission_check: { status: "not_applicable", evidence: "なし", confidence: "low", evidence_times: [] },
      confidence: "medium", uncertainty: "この場面のみ",
    }) });
  };
  try {
    const first = await send(20); const result = await first.json();
    assert.equal(first.status, 200, JSON.stringify(result)); assert.ok(result.analysisId);
    assert.equal((await access.readAllowance(db, "owner", null)).recordings[0].scenesUsed, 1);
    const replay = await send(20); assert.equal((await replay.json()).cached, true); assert.equal(upstreamCalls, 1);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM player_growth_records WHERE source = 'ai'").get().n, 1);
    evidenceTime = 999;
    const unsupported = await send(30); assert.equal(unsupported.status, 200);
    const held = await unsupported.json(); assert.equal(held.review.status, "insufficient"); assert.deepEqual(held.review.observed, []);
    assert.deepEqual(held.review.skill_assessments, []);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM player_growth_records").get().n, 1);
    assert.equal((await access.readAllowance(db, "owner", null)).recordings[0].scenesUsed, 1);
    failUpstream = true;
    const failed = await send(40); assert.equal(failed.status, 502); assert.doesNotMatch(JSON.stringify(await failed.json()), /private provider error|test-server-key/);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM analysis_locks").get().n, 0);
    assert.equal((await access.readAllowance(db, "owner", null)).recordings[0].scenesUsed, 1);
    const record = db.sqlite.prepare("SELECT result_json, usage_json FROM analysis_records WHERE status = 'succeeded'").get();
    assert.equal(JSON.parse(record.usage_json).input_tokens, 123); assert.doesNotMatch(record.result_json, /data:image|test-server-key/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__ANALYSIS_TEST_ENV__.DB;
    delete globalThis.__ANALYSIS_TEST_ENV__.OPENAI_API_KEY;
    delete globalThis.__ANALYSIS_TEST_ENV__.VIDEO_ANALYSIS_BACKEND_URL;
    delete globalThis.__ANALYSIS_TEST_ENV__.VIDEO_ANALYSIS_BACKEND_TOKEN;
    db.sqlite.close();
  }
});

test("malformed analysis and feedback bodies return a client error", async () => {
  for (const body of ["null", "[]", "{"]) {
    assert.equal((await api.POST(new Request("https://review.test/api/analyze", { method: "POST", body }))).status, 400);
    assert.equal((await feedback.POST(new Request("https://review.test/api/review-feedback", { method: "POST", headers: { "oai-authenticated-user-id": "owner" }, body }))).status, 400);
  }
});

test("subscription renewal refreshes the period and ignores another subscription's events", async () => {
  const db = database(); globalThis.__ANALYSIS_TEST_ENV__.DB = db;
  const now = Math.floor(Date.now() / 1000);
  const start = new Date((now - 10) * 1000).toISOString();
  const end = new Date((now + 100) * 1000).toISOString();
  db.sqlite.prepare("INSERT INTO billing_entitlements (user_id,plan,status,checkout_session_id,subscription_id,starts_at,ends_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("owner", "card_monthly", "active", "cs_test", "sub_current", start, end, start);
  try {
    await billing.updateSubscription({ id: "sub_old", metadata: { user_id: "owner" }, status: "canceled" });
    assert.equal((await billing.getEntitlement("owner")).status, "active");
    await billing.updateSubscription({ id: "sub_current", metadata: { user_id: "owner" }, status: "active", items: { data: [{ current_period_start: now, current_period_end: now + 86400 }] } });
    const renewed = await billing.getEntitlement("owner");
    assert.equal(renewed.startsAt, new Date(now * 1000).toISOString());
    assert.equal(renewed.endsAt, new Date((now + 86400) * 1000).toISOString());
    await billing.updateSubscription({ id: "sub_current", metadata: { user_id: "owner" }, status: "past_due" });
    assert.equal((await billing.getEntitlement("owner")).status, "inactive");
  } finally { delete globalThis.__ANALYSIS_TEST_ENV__.DB; db.sqlite.close(); }
});

test("AIM capture windows validate at boundaries, caches separate mode and crop, offsets preserve aspect", () => {
  for (const anchor of [0.4, 5.1234, 9.55]) {
    const targets = modes.captureTargets("aim", anchor, 10);
    assert.equal(targets.length, 6);
    assert.equal(modes.validAimSequence(targets.map(t => t.time), anchor), true);
  }
  for (const anchor of [0.39, 9.57, 10, NaN]) assert.deepEqual(modes.captureTargets("aim", anchor, 10), []);
  assert.equal(modes.analysisSceneKey("tactics", 10.2), "10");
  assert.equal(new Set([modes.analysisSceneKey("tactics", 10), modes.analysisSceneKey("aim", 10), modes.analysisSceneKey("aim", 10, "full"), modes.analysisSceneKey("aim", 10.001)]).size, 4);
  assert.ok(Math.abs(modes.targetOffset({x:.6,y:.5},{x:.5,y:.5},2).distance - 20) < 1e-9);
  assert.equal(modes.targetOffset({x:2,y:.5},{x:.5,y:.5},1), null);
  const forged = {skill:"aim",level:3,evidence:"同じ照準",times:[10,10.001,10.002]};
  assert.deepEqual(growth.verifiedSkillRatings([forged],[9.6,9.8,10],true,"aim"),[]);
  assert.equal(growth.verifiedSkillRatings([{...forged,times:[9.601,9.801,10.001]}],[9.6,9.8,10],true,"aim")[0].times.length,3);
  assert.deepEqual(growth.verifiedSkillRatings([{...forged,times:[9.6,9.8,10]}],[9.6,9.8,10],true,"tactics"),[]);
});

test("AIM uses one six-image call and shared credits, excludes monthly XP, and holds duplicated evidence", async () => {
  const db=database(); const originalFetch=globalThis.fetch;
  Object.assign(globalThis.__ANALYSIS_TEST_ENV__,{DB:db,OPENAI_API_KEY:"test-server-key"});
  let calls=0; let duplicateEvidence=false;
  const frames=modes.captureTargets("aim",10,30).map(({time})=>({time,label:"AIM",dataUrl:"data:image/jpeg;base64,AA=="}));
  const send=(mode="aim",crop="center",input=frames)=>api.POST(new Request("https://review.test/api/analyze",{
    method:"POST",headers:{"oai-authenticated-user-id":"owner","content-type":"application/json"},
    body:JSON.stringify({mode,aimCrop:crop,recordingId:"b".repeat(64),deathTimestamp:10,frames:input,monthlyTracking:mode==="aim",previousMission:"必ずクリア",renewMonthly:true}),
  }));
  globalThis.fetch=async (_url,options)=>{
    calls++; const body=JSON.parse(options.body); const isAim=body.instructions.includes("試合後AIM");
    assert.equal(body.input[0].content.filter(c=>c.type==="input_image").length,6);
    assert.ok(body.input[0].content.filter(c=>c.type==="input_image").every(c=>c.detail==="low"));
    assert.equal(body.max_output_tokens,2600); assert.equal(body.store,false);
    if(isAim){ assert.deepEqual(body.text.format.schema.properties.skill_assessments.items.properties.skill.enum,["aim","crosshair"]); assert.ok(!body.text.format.schema.properties.monthly_plan); }
    const times=duplicateEvidence?[10,10.001,10.002]:[9.6,9.8,10];
    return Response.json({usage:{input_tokens:600,output_tokens:300},output_text:JSON.stringify({
      status:"ok",headline:"照準を置く",observed:["頭の高さに照準"],
      evidence_frames:times.map(time=>({time,observation:"同じ敵と照準が見える"})),
      skill_assessments:[{skill:isAim?"aim":"crosshair",level:3,evidence:"位置関係を確認",times}],
      main_issue:{category:"照準の初期位置",severity:"low",evidence:"頭の高さに置く"},improvements:["同じ距離で確認"],next_focus:"頭の高さを確認",
      mission_check:{status:"cleared",confidence:"high",evidence:"達成",evidence_times:[10]},confidence:"medium",uncertainty:"画像間の動きは不明",
    })});
  };
  try {
    const malformed=await send("aim","center",frames.slice(1)); assert.equal(malformed.status,400); assert.equal(calls,0);
    const first=await send(); const result=await first.json(); assert.equal(first.status,200,JSON.stringify(result));
    assert.equal(result.review.mode,"aim"); assert.equal(result.review.mission_check.status,"not_applicable"); assert.ok(!result.monthly); assert.ok(!result.xpAwarded);
    assert.equal(result.review.skill_assessments[0].skill,"aim"); assert.equal(calls,1);
    assert.equal((await (await send()).json()).cached,true); assert.equal(calls,1);
    duplicateEvidence=true;
    const held=await (await send("aim","full")).json(); assert.equal(held.review.status,"insufficient"); assert.deepEqual(held.review.skill_assessments,[]);
    assert.equal((await access.readAllowance(db,"owner",null)).recordings[0].scenesUsed,1);
    duplicateEvidence=false;
    assert.equal((await send("aim","full")).status,200);
    const tactics=await (await send("tactics")).json(); assert.equal(tactics.review.mode,"tactics"); assert.ok(!tactics.cached);
    assert.equal((await access.readAllowance(db,"owner",null)).recordings[0].scenesUsed,3);
    const later=frames.map(f=>({...f,time:f.time+1}));
    const exhausted=await api.POST(new Request("https://review.test/api/analyze",{method:"POST",headers:{"oai-authenticated-user-id":"owner"},body:JSON.stringify({mode:"aim",recordingId:"b".repeat(64),deathTimestamp:11,frames:later})}));
    assert.equal(exhausted.status,402); assert.equal(calls,4);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM player_growth_records").get().n,3);
    const usage=JSON.parse(db.sqlite.prepare("SELECT usage_json FROM analysis_records WHERE scene_key = 'aim:center:10000' AND status = 'succeeded'").get().usage_json);
    assert.equal(usage.review_mode,"aim"); assert.equal(usage.input_images,6);
    assert.equal(billing.getBillingPlanDetails("card_monthly").priceYen,900);
    assert.equal(billing.getBillingPlanDetails("climb_card_monthly").priceYen,1800);
  } finally {globalThis.fetch=originalFetch;delete globalThis.__ANALYSIS_TEST_ENV__.DB;delete globalThis.__ANALYSIS_TEST_ENV__.OPENAI_API_KEY;db.sqlite.close();}
});
