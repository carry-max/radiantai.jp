import { getMissionDb, type MissionDatabase } from "@/lib/monthly-store";
import { getBillingPlanDetails, getEntitlement, type BillingEntitlement } from "@/lib/billing";
import { serviceConfig } from "@/lib/service-config";
import { TACTICS_COACH_LIMITS, type AnalysisAccessKind, type TacticsCoach } from "@/lib/tactics-coaches";

export const SCENES_PER_MATCH = 3;
export const TRANSFERABLE_MATCHES = 2;
export type AllowanceBucket = {
  tier: string; periodKey: string; limit: number; used: number; remaining: number; scenesPerMatch: number;
  endsAt: string | null; recordings: { recordingId: string; scenesUsed: number }[];
};
export type AnalysisAllowance = AllowanceBucket & { tactics: Record<TacticsCoach, AllowanceBucket> };
export class AccessError extends Error {
  constructor(message: string, public status = 429) { super(message); }
}
const TRANSFER_KINDS: AnalysisAccessKind[] = ["standard", "tactics:riot", "tactics:deep"];
function paidBasePeriodKey(entitlement: BillingEntitlement | null, now = Date.now()) {
  return entitlement?.status === "active" && Date.parse(entitlement.startsAt) <= now && Date.parse(entitlement.endsAt) > now
    ? `${entitlement.plan}:${entitlement.startsAt}:${entitlement.endsAt}` : null;
}
function transferPrefix(base: string, target: AnalysisAccessKind) { return `${base}:transfer-v1:to:${target}:from:`; }
export function analysisPeriod(entitlement: BillingEntitlement | null, now = Date.now(), accessKind: AnalysisAccessKind = "standard") {
  const details = entitlement && getBillingPlanDetails(entitlement.plan);
  if (details && entitlement?.status === "active" && Date.parse(entitlement.startsAt) <= now && Date.parse(entitlement.endsAt) > now) {
    const basePeriodKey = `${entitlement.plan}:${entitlement.startsAt}:${entitlement.endsAt}`;
    const coach = accessKind.startsWith("tactics:") ? accessKind.slice(8) as TacticsCoach : null;
    return {
      tier: details.tierLabel,
      periodKey: coach ? `${basePeriodKey}:${accessKind}` : basePeriodKey,
      limit: coach ? TACTICS_COACH_LIMITS[coach] : details.analysisCredits,
      endsAt: entitlement.endsAt,
    };
  }
  // The free trial remains one shared recording across AIM and every tactics coach.
  return { tier: "無料体験", periodKey: "trial-v1", limit: 1, endsAt: null };
}
export async function readAllowance(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null, accessKind: AnalysisAccessKind = "standard"): Promise<AllowanceBucket> {
  const period = analysisPeriod(entitlement, Date.now(), accessKind);
  const rows = await db.prepare("SELECT recording_id, CAST(COUNT(*) AS INTEGER) AS scenes FROM analysis_records WHERE user_id = ? AND period_key = ? AND status = 'succeeded' GROUP BY recording_id").bind(userId, period.periodKey).all<{ recording_id: string; scenes: number }>();
  const base = paidBasePeriodKey(entitlement);
  const donated = base && TRANSFER_KINDS.includes(accessKind)
    ? await db.prepare("SELECT CAST(COUNT(DISTINCT recording_id) AS INTEGER) AS count FROM analysis_records WHERE user_id = ? AND period_key LIKE ? AND status = 'succeeded'").bind(userId, `${base}:transfer-v1:%:from:${accessKind}`).first<{ count: number }>()
    : null;
  const used = rows.results.length + (donated?.count || 0);
  return { ...period, used, remaining: Math.max(0, period.limit - used), scenesPerMatch: SCENES_PER_MATCH, recordings: rows.results.map(row => ({ recordingId: row.recording_id, scenesUsed: row.scenes })) };
}

async function transferPeriod(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null, target: AnalysisAccessKind, now: number) {
  const base = paidBasePeriodKey(entitlement, now);
  if (!base || !TRANSFER_KINDS.includes(target)) return null;
  const used = await db.prepare("SELECT CAST(COUNT(DISTINCT recording_id) AS INTEGER) AS count FROM analysis_records WHERE user_id = ? AND period_key LIKE ? AND status IN ('pending','succeeded')").bind(userId, `${base}:transfer-v1:%`).first<{ count: number }>();
  if ((used?.count || 0) >= TRANSFERABLE_MATCHES) return null;
  for (const donor of TRANSFER_KINDS.filter(kind => kind !== target)) {
    const allowance = await readAllowance(db, userId, entitlement, donor);
    if (allowance.remaining > 0) return `${transferPrefix(base, target)}${donor}`;
  }
  return null;
}
export async function getAnalysisAllowance(userId: string): Promise<AnalysisAllowance> {
  const db = getMissionDb();
  const entitlement = await getEntitlement(userId);
  const [standard, riot, replay, deep] = await Promise.all([
    readAllowance(db, userId, entitlement),
    readAllowance(db, userId, entitlement, "tactics:riot"),
    readAllowance(db, userId, entitlement, "tactics:replay"),
    readAllowance(db, userId, entitlement, "tactics:deep"),
  ]);
  return { ...standard, tactics: { riot, replay, deep } };
}
export type Reservation = { db: MissionDatabase; userId: string; token: string; id: string; periodKey: string; recordingId: string; sceneKey: string };
export type BatchReservation = { db: MissionDatabase; userId: string; token: string; reservations: Reservation[] };
export async function releaseAnalysis(r: Reservation) {
  await r.db.batch([r.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(r.userId, r.token)]);
}
export async function reserveAnalysis(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null, recordingId: string, sceneKey: string, now = Date.now(), accessKind: AnalysisAccessKind = "standard") {
  const token = crypto.randomUUID();
  const lock = await db.prepare("INSERT INTO analysis_locks (user_id, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE analysis_locks.expires_at <= ? RETURNING token").bind(userId, token, now + 180000, now).first();
  if (!lock) throw new AccessError("別の解析が進行中です。完了してからお試しください。", 409);
  const period = analysisPeriod(entitlement, now, accessKind);
  const reservation = { db, userId, token, id: crypto.randomUUID(), periodKey: period.periodKey, recordingId, sceneKey };
  try {
    const base = paidBasePeriodKey(entitlement, now);
    const targetTransferPattern = base ? `${transferPrefix(base, accessKind)}%` : "";
    const cached = await db.prepare("SELECT id, result_json FROM analysis_records WHERE user_id = ? AND (period_key = ? OR (? <> '' AND period_key LIKE ?)) AND recording_id = ? AND scene_key = ? AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1").bind(userId, period.periodKey, targetTransferPattern, targetTransferPattern, recordingId, sceneKey).first<{ id: string; result_json: string }>();
    if (cached) {
      await releaseAnalysis(reservation);
      return { cached: { ...JSON.parse(cached.result_json), analysisId: cached.id, cached: true }, reservation: null };
    }
    const allowance = await readAllowance(db, userId, entitlement, accessKind);
    const recording = allowance.recordings.find(item => item.recordingId === recordingId);
    const transferredRecording = targetTransferPattern ? await db.prepare("SELECT period_key, CAST(COUNT(*) AS INTEGER) AS scenes FROM analysis_records WHERE user_id = ? AND period_key LIKE ? AND recording_id = ? AND status = 'succeeded' GROUP BY period_key LIMIT 1").bind(userId, targetTransferPattern, recordingId).first<{ period_key: string; scenes: number }>() : null;
    const scenesUsed = recording?.scenesUsed || transferredRecording?.scenes || 0;
    if (scenesUsed >= SCENES_PER_MATCH) throw new AccessError("この試合の3場面を解析済みです。別の試合を選んでください。", 402);
    if (transferredRecording) reservation.periodKey = transferredRecording.period_key;
    else if (!recording && allowance.remaining <= 0) {
      const transferredPeriod = await transferPeriod(db, userId, entitlement, accessKind, now);
      if (!transferredPeriod) throw new AccessError("このモードの解析枠と振替可能枠を使い切りました。料金・利用状況から確認できます。", 402);
      reservation.periodKey = transferredPeriod;
    }
    const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const userBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < 12 RETURNING used").bind(`user:${userId}:${day}`).first();
    if (!userBudget) throw new AccessError("本日の解析上限に達しました。翌日（日本時間）にお試しください。失敗・保留も1日12回の上限に含みます。");
    const globalBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used").bind(`service:${day}`, serviceConfig().dailyLimit).first();
    if (!globalBudget) throw new AccessError("本日の受付上限に達しました。翌日（日本時間）にお試しください。試合枠は消費していません。", 503);
    await db.batch([db.prepare("INSERT INTO analysis_records (id,user_id,period_key,recording_id,scene_key,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(reservation.id, userId, reservation.periodKey, recordingId, sceneKey, new Date(now).toISOString())]);
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

export async function reserveRiotClassificationBatch(db: MissionDatabase, userId: string, entitlement: BillingEntitlement | null, recordingIds: string[], now = Date.now()) {
  const uniqueIds = [...new Set(recordingIds)];
  if (!uniqueIds.length || uniqueIds.length !== recordingIds.length || uniqueIds.length > 50) throw new AccessError("1〜50件の重複しない試合を指定してください。", 400);
  const token = crypto.randomUUID();
  const lock = await db.prepare("INSERT INTO analysis_locks (user_id, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE analysis_locks.expires_at <= ? RETURNING token").bind(userId, token, now + 180000, now).first();
  if (!lock) throw new AccessError("別の解析が進行中です。完了してからお試しください。", 409);
  const period = analysisPeriod(entitlement, now, "tactics:riot");
  const shell: BatchReservation = { db, userId, token, reservations: [] };
  try {
    const cached: Record<string, Record<string, unknown>> = {};
    const pendingIds: string[] = [];
    for (const recordingId of uniqueIds) {
      const row = await db.prepare("SELECT id, result_json FROM analysis_records WHERE user_id = ? AND period_key = ? AND recording_id = ? AND scene_key = 'jev-summary:v1' AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1").bind(userId, period.periodKey, recordingId).first<{ id: string; result_json: string }>();
      if (row) cached[recordingId] = { ...JSON.parse(row.result_json), analysisId: row.id, cached: true };
      else pendingIds.push(recordingId);
    }
    const allowance = await readAllowance(db, userId, entitlement, "tactics:riot");
    const known = new Map(allowance.recordings.map(item => [item.recordingId, item.scenesUsed]));
    const newRecordings = pendingIds.filter(id => !known.has(id)).length;
    if (newRecordings > allowance.remaining) throw new AccessError(`Riot AIの残りは${allowance.remaining}試合です。件数を減らしてください。`, 402);
    if (pendingIds.some(id => (known.get(id) || 0) >= SCENES_PER_MATCH)) throw new AccessError("3解析済みの試合が含まれています。別の試合を選んでください。", 402);
    if (!pendingIds.length) {
      await db.batch([db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(userId, token)]);
      return { cached, batch: null };
    }
    const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const userBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < 12 RETURNING used").bind(`user:${userId}:${day}`).first();
    if (!userBudget) throw new AccessError("本日の解析上限に達しました。翌日（日本時間）にお試しください。");
    const globalBudget = await db.prepare("INSERT INTO analysis_budgets (id, used) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used").bind(`service:${day}`, serviceConfig().dailyLimit).first();
    if (!globalBudget) throw new AccessError("本日の受付上限に達しました。翌日（日本時間）にお試しください。試合枠は消費していません。", 503);
    const timestamp = new Date(now).toISOString();
    shell.reservations = pendingIds.map(recordingId => ({ db, userId, token, id: crypto.randomUUID(), periodKey: period.periodKey, recordingId, sceneKey: "jev-summary:v1" }));
    await db.batch(shell.reservations.map(reservation => db.prepare("INSERT INTO analysis_records (id,user_id,period_key,recording_id,scene_key,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(reservation.id, userId, period.periodKey, reservation.recordingId, reservation.sceneKey, timestamp)));
    return { cached, batch: shell };
  } catch (error) {
    await db.batch([db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(userId, token)]);
    throw error;
  }
}

export async function completeRiotClassificationBatch(batch: BatchReservation, payloads: Map<string, Record<string, unknown>>) {
  const statements = batch.reservations.map(reservation => {
    const payload = payloads.get(reservation.recordingId);
    return batch.db.prepare("UPDATE analysis_records SET status = ?, result_json = ?, usage_json = ? WHERE id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM analysis_locks WHERE user_id = ? AND token = ?)")
      .bind(payload ? "succeeded" : "failed", JSON.stringify(payload || {}), JSON.stringify({ model: "typesafe-ai/jev", purpose: "match-classification" }), reservation.id, batch.userId, batch.userId, batch.token);
  });
  statements.push(batch.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(batch.userId, batch.token));
  await batch.db.batch(statements);
}

export async function failRiotClassificationBatch(batch: BatchReservation) {
  const statements = batch.reservations.map(reservation => batch.db.prepare("UPDATE analysis_records SET status = 'failed' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(reservation.id, batch.userId));
  statements.push(batch.db.prepare("DELETE FROM analysis_locks WHERE user_id = ? AND token = ?").bind(batch.userId, batch.token));
  await batch.db.batch(statements);
}
