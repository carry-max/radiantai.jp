import { getMissionDb, type MissionDatabase } from "@/lib/monthly-store";
import { getBillingPlanDetails, getEntitlement, type BillingEntitlement } from "@/lib/billing";
import { serviceConfig } from "@/lib/service-config";

export const SCENES_PER_MATCH = 3;
export type AnalysisAllowance = {
  tier: string; periodKey: string; limit: number; used: number; remaining: number; scenesPerMatch: number;
  endsAt: string | null; recordings: { recordingId: string; scenesUsed: number }[];
};
export class AccessError extends Error {
  constructor(message: string, public status = 429) { super(message); }
}
export function analysisPeriod(entitlement: BillingEntitlement | null, now = Date.now()) {
  const details = entitlement && getBillingPlanDetails(entitlement.plan);
  if (details && entitlement?.status === "active" && Date.parse(entitlement.startsAt) <= now && Date.parse(entitlement.endsAt) > now) {
    return { tier: details.tierLabel, periodKey: `${entitlement.plan}:${entitlement.startsAt}:${entitlement.endsAt}`, limit: details.analysisCredits, endsAt: entitlement.endsAt };
  }
  return { tier: "無料体験", periodKey: "trial-v1", limit: 1, endsAt: null };
}
export async function readAllowance(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null): Promise<AnalysisAllowance> {
  const period = analysisPeriod(entitlement);
  const rows = await db.prepare("SELECT recording_id, CAST(COUNT(*) AS INTEGER) AS scenes FROM analysis_records WHERE user_id = ? AND period_key = ? AND status = 'succeeded' GROUP BY recording_id").bind(userId, period.periodKey).all<{ recording_id: string; scenes: number }>();
  return { ...period, used: rows.results.length, remaining: Math.max(0, period.limit - rows.results.length), scenesPerMatch: SCENES_PER_MATCH, recordings: rows.results.map(row => ({ recordingId: row.recording_id, scenesUsed: row.scenes })) };
}
export async function getAnalysisAllowance(userId: string) { return readAllowance(getMissionDb(), userId, await getEntitlement(userId)); }
export type Reservation = { db: MissionDatabase; userId: string; token: string; id: string; periodKey: string; recordingId: string; sceneKey: string };
export async function releaseAnalysis(r: Reservation) {
  await r.db.batch([r.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(r.userId, r.token)]);
}
export async function reserveAnalysis(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null, recordingId: string, sceneKey: string, now = Date.now()) {
  const token = crypto.randomUUID();
  const lock = await db.prepare("INSERT INTO analysis_locks (user_id, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE analysis_locks.expires_at <= ? RETURNING token").bind(userId, token, now + 180000, now).first();
  if (!lock) throw new AccessError("別の解析が進行中です。完了してからお試しください。", 409);
  const period = analysisPeriod(entitlement, now);
  const reservation = { db, userId, token, id: crypto.randomUUID(), periodKey: period.periodKey, recordingId, sceneKey };
  try {
    const cached = await db.prepare("SELECT id, result_json FROM analysis_records WHERE user_id = ? AND period_key = ? AND recording_id = ? AND scene_key = ? AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1").bind(userId, period.periodKey, recordingId, sceneKey).first<{ id: string; result_json: string }>();
    if (cached) {
      await releaseAnalysis(reservation);
      return { cached: { ...JSON.parse(cached.result_json), analysisId: cached.id, cached: true }, reservation: null };
    }
    const allowance = await readAllowance(db, userId, entitlement);
    const recording = allowance.recordings.find(item => item.recordingId === recordingId);
    if (recording && recording.scenesUsed >= SCENES_PER_MATCH) throw new AccessError("この試合の3場面を解析済みです。別の試合を選んでください。", 402);
    if (!recording && allowance.remaining <= 0) throw new AccessError("新しい試合の解析枠を使い切りました。料金・利用状況から確認できます。", 402);
    const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const userBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < 12 RETURNING used").bind(`user:${userId}:${day}`).first();
    if (!userBudget) throw new AccessError("本日の解析上限に達しました。翌日（日本時間）にお試しください。失敗・保留も1日12回の上限に含みます。");
    const globalBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used").bind(`service:${day}`, serviceConfig().dailyLimit).first();
    if (!globalBudget) throw new AccessError("本日の受付上限に達しました。翌日（日本時間）にお試しください。試合枠は消費していません。", 503);
    await db.batch([db.prepare("INSERT INTO analysis_records (id,user_id,period_key,recording_id,scene_key,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(reservation.id, userId, period.periodKey, recordingId, sceneKey, new Date(now).toISOString())]);
    return { cached: null, reservation };
  } catch (error) { await releaseAnalysis(reservation); throw error; }
}
export async function completeAnalysis(r: Reservation, payload: Record<string, unknown>, succeeded: boolean, usage: unknown = {}) {
  await r.db.batch([
    r.db.prepare("UPDATE analysis_records SET status = ?, result_json = ?, usage_json = ? WHERE id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM analysis_locks WHERE user_id = ? AND token = ?)").bind(succeeded ? "succeeded" : "insufficient", JSON.stringify(payload), JSON.stringify(usage), r.id, r.userId, r.userId, r.token),
    r.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(r.userId, r.token),
  ]);
}
export async function failAnalysis(r: Reservation) {
  await r.db.batch([
    r.db.prepare("UPDATE analysis_records SET status = 'failed' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(r.id, r.userId),
    r.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(r.userId, r.token),
  ]);
}
