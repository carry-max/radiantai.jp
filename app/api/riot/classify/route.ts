import { z } from "zod";
import { getAnalysisAllowance, AccessError, completeRiotClassificationBatch, failRiotClassificationBatch, reserveRiotClassificationBatch } from "@/lib/analysis-access";
import { getEntitlement } from "@/lib/billing";
import { classifyJevMatches, jevMatchesSchema, summarizeJevResults, type JevMatchClassification } from "@/lib/jev-classifier";
import { getMissionDb } from "@/lib/monthly-store";
import { getRiotConnection } from "@/lib/riot-auth";
import { riotRsoConfigured, sameOriginRequest, serviceConfig } from "@/lib/service-config";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const maxDuration = 60;
const requestSchema = z.object({ matches: jevMatchesSchema, clientKind: z.literal("windows-app") }).strict();

export const POST = withAuth(async (request: Request) => {
  if (!sameOriginRequest(request)) return Response.json({ error: "この操作は同じサイトから実行してください。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });
  const config = serviceConfig();
  if (!config.jev.apiKey) return Response.json({ error: "Riot AIの高速分類は準備中です。" }, { status: 503 });
  if (!config.riotApproved || !riotRsoConfigured()) return Response.json({ error: "Riot公式承認後に利用できます。" }, { status: 503 });
  if (!await getRiotConnection(getMissionDb(), user.id)) return Response.json({ error: "Riotアカウントを連携してください。" }, { status: 403 });
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await request.json()); }
  catch { return Response.json({ error: "1〜50件の正しい試合データを送信してください。" }, { status: 400 }); }

  let batch: Awaited<ReturnType<typeof reserveRiotClassificationBatch>>["batch"] = null;
  try {
    const entitlement = await getEntitlement(user.id);
    const reserved = await reserveRiotClassificationBatch(getMissionDb(), user.id, entitlement, input.matches.map(match => match.id));
    batch = reserved.batch;
    const pending = batch ? input.matches.filter(match => batch!.reservations.some(item => item.recordingId === match.id)) : [];
    const classified = pending.length ? await classifyJevMatches(pending, { apiKey: config.jev.apiKey, userId: user.id }) : { results: [], failures: [], summary: summarizeJevResults([], []) };
    if (batch) await completeRiotClassificationBatch(batch, new Map(classified.results.map(result => [result.id, result as unknown as Record<string, unknown>])));
    const cachedResults = Object.values(reserved.cached) as unknown as JevMatchClassification[];
    const results = [...cachedResults, ...classified.results];
    return Response.json({
      model: config.jev.model,
      results,
      failures: classified.failures,
      summary: summarizeJevResults(input.matches, results),
      allowance: await getAnalysisAllowance(user.id),
    }, { status: classified.failures.length && !results.length ? 502 : 200 });
  } catch (error) {
    if (batch) await failRiotClassificationBatch(batch).catch(() => undefined);
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    console.error("jev classification failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Riot AIで分類できませんでした。時間をおいて再度お試しください。" }, { status: 502 });
  }
});
