import { createGateway, experimental_evaluate as evaluate } from "ai";
import { z } from "zod";

export const JEV_MODEL = "typesafe-ai/jev";
export const JEV_MAX_MATCHES = 50;

export const jevMatchSchema = z.object({
  id: z.string().trim().min(1).max(100),
  source: z.enum(["riot", "replay"]),
  map: z.string().trim().min(1).max(80),
  agent: z.string().trim().min(1).max(80),
  result: z.enum(["win", "loss", "draw", "unknown"]).default("unknown"),
  kills: z.number().int().min(0).max(100).optional(),
  deaths: z.number().int().min(0).max(100).optional(),
  assists: z.number().int().min(0).max(100).optional(),
  roundDifference: z.number().int().min(-30).max(30).optional(),
  openingDeaths: z.number().int().min(0).max(30).optional(),
  summary: z.string().trim().max(3000).default(""),
}).strict();

export const jevMatchesSchema = z.array(jevMatchSchema).min(1).max(JEV_MAX_MATCHES).superRefine((matches, context) => {
  const seen = new Set<string>();
  matches.forEach((match, index) => {
    if (seen.has(match.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "試合IDが重複しています。" });
    seen.add(match.id);
  });
});
export const jevBatchSchema = z.object({ matches: jevMatchesSchema }).strict();

export type JevMatch = z.infer<typeof jevMatchSchema>;
export type MatchQuality = "bad" | "mixed" | "good";
export type DeathCause = "opening_death" | "bad_peek" | "positioning" | "trade_timing" | "ability_usage" | "information" | "aim" | "economy" | "other" | "insufficient";
export type JevMatchClassification = {
  id: string; quality: MatchQuality; qualityConfidence: number | null;
  deathCause: DeathCause; deathCauseConfidence: number | null;
  priority: number; needsDeepAnalysis: boolean; deepProbability: number;
  model: string; inputTokens: number | null; outputTokens: number | null;
};

const QUESTIONS = {
  quality: {
    type: "choice",
    instructions: "試合結果やK/Dだけで決めず、意思決定、デスの再現性、目標への貢献を総合して、この試合の改善必要度を1つ選ぶ。情報不足はmixedにする。",
    criteria: {
      bad: "明確で反復しそうな判断ミスまたは大きな改善余地がある",
      mixed: "良い点と悪い点が混在する、または根拠が不足する",
      good: "重大な反復ミスが少なく、意思決定と目標貢献が概ね良い",
    },
  },
  deathCause: {
    type: "choice",
    instructions: "観測できる主なデス原因を1つ選ぶ。推測で埋めず、根拠が足りない場合はinsufficientを選ぶ。",
    criteria: {
      opening_death: "序盤の不利なファーストデス",
      bad_peek: "不必要なピーク、同時に複数射線へ出る、ピーク方法の問題",
      positioning: "遮蔽、距離、退路、高低差など位置取りの問題",
      trade_timing: "味方と交換できない距離やタイミング",
      ability_usage: "アビリティの未使用、順序、タイミングの問題",
      information: "情報不足、確認漏れ、誤読による判断",
      aim: "照準配置、初弾、追いAIMなど機械的AIMが主因",
      economy: "購入や装備差が主因",
      other: "上記以外の確認できる原因",
      insufficient: "根拠不足で分類できない",
    },
  },
  priority: {
    type: "score",
    instructions: "次の練習で直す優先度を評価する。頻度、影響、再現性が高いほど上げる。",
    criteria: ["0: 改善対象なし", "1: 低い", "2: 高い", "3: 最優先"],
  },
  deep: {
    type: "boolean",
    instructions: "原因の確定や具体的な改善指示に、リプレイ映像の時系列・位置・照準の追加確認が必要ならtrue。単純な戦績だけで結論できる場合はfalse。",
    criteria: { true: "追加のDeep解析が有益", false: "高速分類だけで十分" },
  },
} as const;

function probability(record: Record<string, number> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function classifyJevMatch(match: JevMatch, options: { apiKey: string; userId: string }) {
  const gateway = createGateway({ apiKey: options.apiKey });
  const result = await evaluate({
    model: gateway.evaluationModel(JEV_MODEL),
    state: {
      task: "VALORANTの試合後高速分類。入力にない映像・音声・意図を推測しない。",
      match,
    },
    questions: QUESTIONS,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(20_000),
    providerOptions: { gateway: { zeroDataRetention: true, disallowPromptTraining: true, user: options.userId, tags: ["riot-ai", "match-classification"] } },
  });
  const quality = result.answers.quality.choice;
  const deathCause = result.answers.deathCause.choice;
  const priority = Math.max(0, Math.min(3, result.answers.priority.score));
  const deepProbability = result.answers.deep.probability;
  return {
    id: match.id,
    quality,
    qualityConfidence: probability(result.answers.quality.probabilities, quality),
    deathCause,
    deathCauseConfidence: probability(result.answers.deathCause.probabilities, deathCause),
    priority,
    needsDeepAnalysis: deepProbability >= 0.6 || priority >= 2.5 || deathCause === "insufficient",
    deepProbability,
    model: result.response.modelId || JEV_MODEL,
    inputTokens: result.usage.inputTokens ?? null,
    outputTokens: result.usage.outputTokens ?? null,
  } satisfies JevMatchClassification;
}

async function parallelSettledMap<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const output = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = { status: "fulfilled", value: await task(items[index]) }; }
      catch (reason) { output[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

function rankedWeakness(matches: JevMatch[], results: JevMatchClassification[], field: "map" | "agent") {
  const byId = new Map(matches.map(match => [match.id, match]));
  const scores = new Map<string, { name: string; score: number; matches: number; bad: number }>();
  for (const result of results) {
    const name = byId.get(result.id)?.[field];
    if (!name) continue;
    const current = scores.get(name) || { name, score: 0, matches: 0, bad: 0 };
    current.matches++;
    current.score += result.quality === "bad" ? 2 : result.quality === "mixed" ? 1 : 0;
    if (result.quality === "bad") current.bad++;
    scores.set(name, current);
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || b.bad - a.bad || b.matches - a.matches || a.name.localeCompare(b.name, "ja")).slice(0, 5);
}

export function summarizeJevResults(matches: JevMatch[], results: JevMatchClassification[]) {
  const deathCauses = Object.entries(results.reduce<Record<string, number>>((counts, result) => {
    counts[result.deathCause] = (counts[result.deathCause] || 0) + 1;
    return counts;
  }, {})).map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
  return {
    total: results.length,
    badMatches: results.filter(result => result.quality === "bad").map(result => result.id),
    deathCauses,
    weakMaps: rankedWeakness(matches, results, "map"),
    weakAgents: rankedWeakness(matches, results, "agent"),
    improvementOrder: [...results].sort((a, b) => b.priority - a.priority || b.deepProbability - a.deepProbability).map(result => result.id),
    deepAnalysisMatches: results.filter(result => result.needsDeepAnalysis).sort((a, b) => b.priority - a.priority).map(result => result.id),
  };
}

export async function classifyJevMatches(matches: JevMatch[], options: { apiKey: string; userId: string }) {
  if (!options.apiKey.trim()) throw new Error("JEV_NOT_CONFIGURED");
  const settled = await parallelSettledMap(matches, 8, match => classifyJevMatch(match, options));
  const results = settled.flatMap(item => item.status === "fulfilled" ? [item.value] : []);
  const failures = settled.flatMap((item, index) => item.status === "rejected" ? [{ id: matches[index].id, error: "Jevで分類できませんでした。再試行してください。" }] : []);
  return { results, failures, summary: summarizeJevResults(matches, results) };
}
