import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import postgres from "postgres";

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["gpt-5.6-luna", "gpt-5.6-sol"]);
const backendToken = process.env.VIDEO_ANALYSIS_BACKEND_TOKEN?.trim() || "";
const openAiKey = process.env.OPENAI_API_KEY?.trim() || "";
const openAiReviewModel = process.env.OPENAI_REVIEW_MODEL?.trim() || "gpt-5.6-luna";
const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
const geminiAimModel = process.env.GEMINI_AIM_MODEL?.trim() || "gemini-3.8-flash";
const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim() || "";
const storageHost = process.env.SUPABASE_STORAGE_HOST?.trim().toLowerCase() || "";
const sql = databaseUrl ? postgres(databaseUrl, { ssl: "require", max: 2, idle_timeout: 20 }) : null;

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const actual = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  if (!backendToken || actual.length !== backendToken.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(backendToken));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validOpenAiRequest(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && ALLOWED_MODELS.has(value.model)
    && Array.isArray(value.input)
    && value.input.length === 1;
}

async function callOpenAi(payload) {
  if (!openAiKey) return { status: 503, body: { error: { message: "OPENAI_API_KEY is not configured" } } };
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  return { status: upstream.status, body: await upstream.json() };
}

const AIM_MICRO_PROMPT = `あなたはVALORANT映像の観測担当です。入力はプレイヤーのデス前25秒からデス後5秒までのクリップです。
映像で確認できる事実だけを使い、接敵前のクロスヘアプレイスメント、ピーク方法、ピークアドバンテージの作り方、ストッピング、初弾までの照準修正、バースト／スプレー制御、追いAIM、退避判断を観測してください。
反応時間や命中率は明確に測れる場合だけ述べ、通信遅延や見えない敵位置、プレイヤーの意図は断定しません。改善提案はせず、GPTが整理できる観測事実をJSONで返してください。`;

function openAiOutputText(body) {
  return (body?.output || []).flatMap(item => item?.content || []).map(part => part?.text || "").join("");
}

async function organizeWithGpt(kind, evidence, metadata = {}) {
  const instructions = kind === "micro"
    ? "あなたはVALORANTの試合後ミクロコーチです。Geminiが映像から抽出した観測事実だけを根拠に、ピーク、クロスヘア、照準修正、ストッピング、射撃制御の改善点を日本語で整理してください。"
    : "あなたはVALORANTの試合後マクロコーチです。Riot APIの試合データとJevの分類だけを根拠に、試合判断、苦手傾向、改善優先度を日本語で整理してください。映像を見たような表現は使わないでください。";
  const payload = {
    model: openAiReviewModel,
    instructions: `${instructions}\n次の試合で実行する行動を1つに絞り、JSONだけを返してください。`,
    input: [{ role: "user", content: [{ type: "input_text", text: `分析材料: ${JSON.stringify(evidence)}\n補足情報: ${JSON.stringify(metadata)}` }] }],
    reasoning: { effort: "low" },
    max_output_tokens: 2200,
    store: false,
    text: { format: { type: "json_schema", name: `${kind}_coaching`, strict: true, schema: {
      type: "object", additionalProperties: false,
      properties: {
        headline: { type: "string" },
        observed: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        main_issue: { type: "object", additionalProperties: false, properties: { category: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] }, evidence: { type: "string" } }, required: ["category", "severity", "evidence"] },
        improvements: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
        next_focus: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] }, uncertainty: { type: "string" },
      }, required: ["headline", "observed", "main_issue", "improvements", "next_focus", "confidence", "uncertainty"],
    } } },
  };
  const response = await callOpenAi(payload);
  if (response.status < 200 || response.status >= 300) throw new Error(`GPT organization failed: ${response.status}`);
  const text = openAiOutputText(response.body);
  if (!text) throw new Error("GPT organization returned no output");
  return { model: openAiReviewModel, review: JSON.parse(text), usage: response.body.usage || {} };
}

async function uploadGeminiFile(bytes, mimeType, displayName) {
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured");
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(geminiKey)}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw new Error(`Gemini upload start failed: ${start.status}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload URL is missing");
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": String(bytes.length) },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (!uploaded.ok) throw new Error(`Gemini upload failed: ${uploaded.status}`);
  return (await uploaded.json()).file;
}

async function waitForGeminiFile(file) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (file?.state === "ACTIVE") return file;
    if (file?.state === "FAILED") throw new Error("Gemini video processing failed");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(geminiKey)}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Gemini file status failed: ${response.status}`);
    file = await response.json();
  }
  throw new Error("Gemini video processing timed out");
}

async function analyzeAimClip(sourceUrl, metadata = {}) {
  const clipResponse = await fetch(allowedStorageUrl(sourceUrl), { signal: AbortSignal.timeout(120_000) });
  if (!clipResponse.ok) throw new Error(`clip download failed: ${clipResponse.status}`);
  const declaredLength = Number(clipResponse.headers.get("content-length") || 0);
  if (declaredLength > 120 * 1024 * 1024) throw new Error("clip_too_large");
  const bytes = Buffer.from(await clipResponse.arrayBuffer());
  if (!bytes.length || bytes.length > 120 * 1024 * 1024) throw new Error("clip_too_large");
  const mimeType = clipResponse.headers.get("content-type")?.split(";")[0] || "video/mp4";
  let file;
  try {
    file = await uploadGeminiFile(bytes, mimeType, `radiantai-aim-${randomUUID()}`);
    file = await waitForGeminiFile(file);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiAimModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ file_data: { mime_type: mimeType, file_uri: file.uri } }, { text: `${AIM_MICRO_PROMPT}\n試合情報: ${JSON.stringify(metadata)}` }] }],
        generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Gemini analysis failed: ${response.status}`);
    const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
    if (!text) throw new Error("Gemini analysis returned no output");
    const findings = JSON.parse(text);
    const organized = await organizeWithGpt("micro", findings, metadata);
    return { model: `${geminiAimModel} + ${organized.model}`, findings, review: organized.review, usage: { gemini: body.usageMetadata || {}, gpt: organized.usage } };
  } finally {
    if (file?.name) void fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(geminiKey)}`, { method: "DELETE" }).catch(() => undefined);
  }
}

async function ensureJobsTable() {
  if (!sql) return;
  await sql`CREATE TABLE IF NOT EXISTS video_analysis_jobs (
    id text PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
    request_json text NOT NULL,
    result_json text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_video_analysis_jobs_status_created ON video_analysis_jobs (status, created_at)`;
}

async function processJob(id, payload) {
  if (!sql) return;
  await sql`UPDATE video_analysis_jobs SET status = 'running', updated_at = now() WHERE id = ${id} AND status = 'queued'`;
  try {
    const result = await callOpenAi(payload);
    const status = result.status >= 200 && result.status < 300 ? "succeeded" : "failed";
    await sql`UPDATE video_analysis_jobs SET status = ${status}, result_json = ${JSON.stringify(result.body)}, error = ${status === "failed" ? `AI service returned ${result.status}` : null}, updated_at = now() WHERE id = ${id}`;
  } catch (error) {
    await sql`UPDATE video_analysis_jobs SET status = 'failed', error = ${error instanceof Error ? error.message.slice(0, 500) : "analysis failed"}, updated_at = now() WHERE id = ${id}`;
  }
}

function allowedStorageUrl(raw) {
  const url = new URL(raw);
  const hostAllowed = storageHost ? url.hostname === storageHost : url.hostname.endsWith(".supabase.co");
  if (url.protocol !== "https:" || !hostAllowed) throw new Error("invalid_storage_url");
  return url.toString();
}

async function runFfmpeg(sourceUrl, timestamps, crop) {
  const directory = await mkdtemp(join(tmpdir(), "radiantai-frames-"));
  try {
    const frames = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const output = join(directory, `${index}.jpg`);
      const filters = crop === "center" ? ["-vf", "crop=iw*0.55:ih*0.55:iw*0.225:ih*0.225,scale=960:-2"] : ["-vf", "scale=1280:-2"];
      await new Promise((resolve, reject) => {
        const child = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(timestamps[index]), "-i", sourceUrl, "-frames:v", "1", ...filters, "-q:v", "4", "-y", output], { stdio: ["ignore", "ignore", "pipe"] });
        let detail = "";
        child.stderr.on("data", chunk => { detail = (detail + chunk).slice(-1000); });
        child.on("error", reject);
        child.on("close", code => code === 0 ? resolve() : reject(new Error(detail || `ffmpeg exited ${code}`)));
      });
      frames.push({ time: timestamps[index], dataUrl: `data:image/jpeg;base64,${(await readFile(output)).toString("base64")}` });
    }
    return frames;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await ensureJobsTable();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { status: "ok", role: "video-analysis", database: Boolean(sql), ffmpeg: true, aim: { configured: Boolean(geminiKey), model: geminiAimModel } });
    }
    if (!authorized(request)) return json(response, 401, { error: "unauthorized" });

    if (request.method === "POST" && url.pathname === "/v1/analyze") {
      const body = await readJson(request);
      if (!validOpenAiRequest(body.request)) return json(response, 400, { error: "invalid_request" });
      const result = await callOpenAi(body.request);
      return json(response, result.status, result.body);
    }

    if (request.method === "POST" && url.pathname === "/v1/aim/analyze") {
      if (!geminiKey) return json(response, 503, { error: "GEMINI_API_KEY is not configured" });
      const body = await readJson(request);
      if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2500) return json(response, 400, { error: "invalid_source_url" });
      const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
      return json(response, 200, await analyzeAimClip(body.sourceUrl, metadata));
    }

    if (request.method === "POST" && url.pathname === "/v1/macro/organize") {
      const body = await readJson(request);
      if (!Array.isArray(body.matches) || !Array.isArray(body.classifications) || body.matches.length > 50 || body.classifications.length > 50) return json(response, 400, { error: "invalid_macro_input" });
      return json(response, 200, await organizeWithGpt("macro", { matches: body.matches, classifications: body.classifications, summary: body.summary || {} }, body.metadata || {}));
    }

    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      if (!sql) return json(response, 503, { error: "SUPABASE_DATABASE_URL is not configured" });
      const body = await readJson(request);
      if (!validOpenAiRequest(body.request)) return json(response, 400, { error: "invalid_request" });
      const id = randomUUID();
      await sql`INSERT INTO video_analysis_jobs (id, status, request_json) VALUES (${id}, 'queued', ${JSON.stringify(body.request)})`;
      void processJob(id, body.request);
      return json(response, 202, { id, status: "queued" });
    }

    const jobMatch = request.method === "GET" && url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})$/i);
    if (jobMatch) {
      if (!sql) return json(response, 503, { error: "SUPABASE_DATABASE_URL is not configured" });
      const rows = await sql`SELECT id, status, result_json, error, created_at, updated_at FROM video_analysis_jobs WHERE id = ${jobMatch[1]}`;
      if (!rows[0]) return json(response, 404, { error: "not_found" });
      return json(response, 200, { ...rows[0], result: rows[0].result_json ? JSON.parse(rows[0].result_json) : null, result_json: undefined });
    }

    if (request.method === "POST" && url.pathname === "/v1/frames") {
      const body = await readJson(request);
      const timestamps = Array.isArray(body.timestamps) ? body.timestamps.filter(value => Number.isFinite(value) && value >= 0 && value <= 3600).slice(0, 6) : [];
      if (timestamps.length < 2) return json(response, 400, { error: "2_to_6_timestamps_required" });
      const sourceUrl = allowedStorageUrl(body.sourceUrl);
      const frames = await runFfmpeg(sourceUrl, timestamps, body.crop === "center" ? "center" : "full");
      return json(response, 200, { frames });
    }

    return json(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    const status = ["request_too_large", "clip_too_large"].includes(message) ? 413 : message === "invalid_storage_url" ? 400 : 500;
    return json(response, status, { error: status === 500 ? "internal_error" : message });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`video-analysis listening on ${PORT}`);
});
