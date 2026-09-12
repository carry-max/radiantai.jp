import { env } from "@/lib/runtime-env";
import {
  DAY_MS, MONTHLY_BONUS_XP, MONTHLY_DAYS, WEEKLY_XP,
  parseMonthlyPlan, verifiedMonthlyCheck,
  type MonthlyCycle, type MonthlySummary, type MonthlyTask,
} from "@/lib/monthly-missions";

type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};
export type MissionDatabase = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
type CycleRow = { id: string; started_at: string; ends_at: string; baseline_focus: string; tasks_json: string; current_step: number; xp: number };
type AttemptRow = { step: number; recording_id: string; status: string; confidence: string; evidence: string; evidence_times_json: string; xp: number; created_at: string };

export function getMissionDb(): MissionDatabase {
  const db = (env as unknown as { DB?: MissionDatabase }).DB;
  if (!db) throw new Error("月間ミッションの保存先に接続できません。");
  return db;
}

export async function getMonthlySummary(db: MissionDatabase, userId: string, now = Date.now()): Promise<MonthlySummary> {
  const row = await db.prepare("SELECT * FROM monthly_mission_cycles WHERE user_id = ? ORDER BY started_at DESC, id DESC LIMIT 1").bind(userId).first<CycleRow>();
  const totals = await db.prepare("SELECT CAST(COALESCE(SUM(xp), 0) AS INTEGER) AS xp, CAST(COALESCE(SUM(CASE WHEN current_step = 4 THEN 1 ELSE 0 END), 0) AS INTEGER) AS completed FROM monthly_mission_cycles WHERE user_id = ?").bind(userId).first<{ xp: number; completed: number }>();
  let cycle: MonthlyCycle | null = null;
  if (row) {
    const attempts = await db.prepare("SELECT * FROM monthly_mission_reviews WHERE user_id = ? AND cycle_id = ? AND step >= 0 ORDER BY created_at DESC, id DESC").bind(userId, row.id).all<AttemptRow>();
    cycle = {
      id: row.id, startedAt: row.started_at, endsAt: row.ends_at, baselineFocus: row.baseline_focus,
      tasks: parseMonthlyPlan(JSON.parse(row.tasks_json)), currentStep: row.current_step, xp: row.xp,
      checks: attempts.results.map((attempt) => ({
        step: attempt.step, recordingId: attempt.recording_id, status: attempt.status as MonthlyCycle["checks"][number]["status"],
        confidence: attempt.confidence as "low" | "medium" | "high", evidence: attempt.evidence,
        evidence_times: JSON.parse(attempt.evidence_times_json), xp: attempt.xp, createdAt: attempt.created_at,
      })),
    };
  }
  return { cycle, totalXp: totals?.xp ?? 0, completedMonths: totals?.completed ?? 0, serverNow: new Date(now).toISOString() };
}

export type MonthlyContext = {
  mode: "start" | "check" | "skip";
  userId: string;
  recordingId: string;
  cycleId: string | null;
  step: number;
  task: MonthlyTask | null;
  notice: string;
};

export async function prepareMonthlyReview(db: MissionDatabase, userId: string, recordingId: string, renew: boolean, now = Date.now()): Promise<MonthlyContext> {
  const summary = await getMonthlySummary(db, userId, now);
  const cycle = summary.cycle;
  const context: MonthlyContext = { mode: "skip", userId, recordingId, cycleId: cycle?.id ?? null, step: cycle?.currentStep ?? 0, task: null, notice: "" };
  const used = await db.prepare("SELECT id FROM monthly_mission_reviews WHERE user_id = ? AND recording_id = ? LIMIT 1").bind(userId, recordingId).first();
  if (used) return { ...context, notice: "この録画は月間ミッションで確認済みです。XPは重複して付与されません。" };
  if (!cycle || (now >= Date.parse(cycle.endsAt) && renew)) return { ...context, mode: "start" };
  if (now >= Date.parse(cycle.endsAt)) return { ...context, notice: "30日間が終了しました。次の30日を始めると、新しいミッションを作れます。" };
  if (cycle.currentStep >= 4) return { ...context, notice: "今月の4ミッションは達成済みです。獲得XPはそのまま残ります。" };
  return { ...context, mode: "check", task: cycle.tasks[cycle.currentStep] };
}

export async function saveMonthlyReview(
  db: MissionDatabase,
  context: MonthlyContext,
  review: { status?: unknown; next_focus?: unknown; monthly_plan?: unknown; mission_check?: unknown },
  frameTimes: number[],
  now = Date.now(),
) {
  const timestamp = new Date(now).toISOString();
  let notice = context.notice;
  let xpAwarded = 0;
  const attemptId = crypto.randomUUID();
  const check = verifiedMonthlyCheck(review.mission_check, frameTimes, review.status === "ok");
  if (context.mode === "check" && check.status === "not_applicable") {
    check.status = "insufficient";
    check.evidence = "今回の場面では対象の行動を確認できないため、次の録画に引き継ぎます。";
  }

  if (context.mode === "start" && review.status === "ok") {
    const tasks = parseMonthlyPlan(review.monthly_plan);
    const cycleId = crypto.randomUUID();
    const endsAt = new Date(now + MONTHLY_DAYS * DAY_MS).toISOString();
    const focus = typeof review.next_focus === "string" ? review.next_focus.trim().slice(0, 300) : tasks[0].action;
    await db.batch([
      db.prepare(`INSERT INTO monthly_mission_cycles (id, user_id, started_at, ends_at, baseline_focus, tasks_json, current_step, xp)
        SELECT ?, ?, ?, ?, ?, ?, 0, 0
        WHERE NOT EXISTS (SELECT 1 FROM monthly_mission_cycles WHERE user_id = ? AND ends_at > ?)
        AND NOT EXISTS (SELECT 1 FROM monthly_mission_reviews WHERE user_id = ? AND recording_id = ?)`)
        .bind(cycleId, context.userId, timestamp, endsAt, focus, JSON.stringify(tasks), context.userId, timestamp, context.userId, context.recordingId),
      db.prepare(`INSERT INTO monthly_mission_reviews (id, cycle_id, user_id, recording_id, step, status, confidence, evidence, evidence_times_json, xp, created_at)
        SELECT ?, id, user_id, ?, -1, 'not_applicable', 'low', 'ミッション作成に使用した録画', '[]', 0, ?
        FROM monthly_mission_cycles WHERE id = ? AND user_id = ?`)
        .bind(attemptId, context.recordingId, timestamp, cycleId, context.userId),
    ]);
    notice = "30日ミッションを開始しました。次の録画から達成をAIが確認します。";
  } else if (context.mode === "start") {
    notice = "映像の情報が不足しています。ミッションの期間はまだ開始していません。";
  } else if (context.mode === "check" && check.status !== "not_applicable") {
    const cleared = check.status === "cleared";
    const reward = cleared ? WEEKLY_XP + (context.step === 3 ? MONTHLY_BONUS_XP : 0) : 0;
    // Both statements are one database transaction. A stale step or repeated recording
    // cannot insert an award, and only this exact inserted attempt can advance XP.
    await db.batch([
      db.prepare(`INSERT INTO monthly_mission_reviews (id, cycle_id, user_id, recording_id, step, status, confidence, evidence, evidence_times_json, xp, created_at)
        SELECT ?, id, user_id, ?, ?, ?, ?, ?, ?, ?, ? FROM monthly_mission_cycles
        WHERE id = ? AND user_id = ? AND current_step = ? AND current_step < 4 AND ends_at > ?
        ON CONFLICT(user_id, recording_id) DO NOTHING`)
        .bind(attemptId, context.recordingId, context.step, check.status, check.confidence, check.evidence, JSON.stringify(check.evidence_times), reward, timestamp,
          context.cycleId, context.userId, context.step, timestamp),
      db.prepare(`UPDATE monthly_mission_cycles SET current_step = current_step + ?, xp = xp + ?
        WHERE id = ? AND user_id = ? AND current_step = ? AND ends_at > ?
        AND EXISTS (SELECT 1 FROM monthly_mission_reviews WHERE id = ? AND cycle_id = monthly_mission_cycles.id AND user_id = ?)`)
        .bind(cleared ? 1 : 0, reward, context.cycleId, context.userId, context.step, timestamp, attemptId, context.userId),
    ]);
    const inserted = await db.prepare("SELECT xp FROM monthly_mission_reviews WHERE id = ? AND user_id = ?").bind(attemptId, context.userId).first<{ xp: number }>();
    xpAwarded = inserted?.xp ?? 0;
    notice = !inserted ? "判定中に期限または進捗が変わりました。最新のミッションを表示しています。"
      : cleared ? (context.step === 3 ? "4つのミッション達成！50 XP＋月間ボーナス100 XPを獲得しました。" : "映像で達成を確認しました。50 XPを獲得しました。")
      : "今回はXPの加算なし。減点はありません。課題は次の録画へ引き継ぎます。";
  }

  return { monthly: await getMonthlySummary(db, context.userId, now), notice, xpAwarded, check };
}
