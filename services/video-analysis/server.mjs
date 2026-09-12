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
      return json(response, 200, { status: "ok", role: "video-analysis", database: Boolean(sql), ffmpeg: true });
    }
    if (!authorized(request)) return json(response, 401, { error: "unauthorized" });

    if (request.method === "POST" && url.pathname === "/v1/analyze") {
      const body = await readJson(request);
      if (!validOpenAiRequest(body.request)) return json(response, 400, { error: "invalid_request" });
      const result = await callOpenAi(body.request);
      return json(response, result.status, result.body);
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
    const status = message === "request_too_large" ? 413 : message === "invalid_storage_url" ? 400 : 500;
    return json(response, status, { error: status === 500 ? "internal_error" : message });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`video-analysis listening on ${PORT}`);
});
