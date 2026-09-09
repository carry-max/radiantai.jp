import type { MissionDatabase } from "@/lib/monthly-store";
import type { GrowthSource, PlayerGrowthRecord, SkillRating } from "@/lib/player-growth";

type Row = { id: string; source: GrowthSource; recorded_at: string; label: string; note: string; ratings_json: string };
export async function getPlayerGrowth(db: MissionDatabase, userId: string): Promise<PlayerGrowthRecord[]> {
  const sets = await Promise.all((["self", "ai"] as const).map(source => db.prepare("SELECT id,source,recorded_at,label,note,ratings_json FROM player_growth_records WHERE user_id = ? AND source = ? ORDER BY recorded_at DESC, id DESC LIMIT 120").bind(userId, source).all<Row>()));
  return sets.flatMap(set => set.results.map(row => ({ id: row.id, source: row.source, recordedAt: row.recorded_at, label: row.label, note: row.note, ratings: JSON.parse(row.ratings_json) as SkillRating[] })))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function saveSelfGrowth(db: MissionDatabase, userId: string, record: { id: string; label: string; note: string; ratings: SkillRating[] }, now = Date.now()) {
  const existing = await db.prepare("SELECT id FROM player_growth_records WHERE id = ? AND user_id = ? AND source = 'self'").bind(record.id, userId).first();
  if (existing) return true;
  const dayStart = new Date(now + 9 * 3600000).toISOString().slice(0, 10) + "T00:00:00+09:00";
  const row = await db.prepare(`INSERT INTO player_growth_records (id,user_id,source,recorded_at,label,note,ratings_json)
    SELECT ?,?,'self',?,?,?,? WHERE (SELECT COUNT(*) FROM player_growth_records WHERE user_id = ? AND source = 'self' AND recorded_at >= ?) < 20
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(record.id, userId, new Date(now).toISOString(), record.label, record.note, JSON.stringify(record.ratings), userId, new Date(dayStart).toISOString()).first();
  return Boolean(row);
}

export async function saveAiGrowth(db: MissionDatabase, userId: string, analysisId: string, ratings: SkillRating[], label: string, now = Date.now()) {
  if (!ratings.length) return;
  await db.batch([db.prepare("INSERT INTO player_growth_records (id,user_id,source,analysis_id,recorded_at,label,note,ratings_json) VALUES (?,?,'ai',?,?,?,'',?) ON CONFLICT(user_id,analysis_id) DO NOTHING")
    .bind(crypto.randomUUID(), userId, analysisId, new Date(now).toISOString(), label.slice(0, 100), JSON.stringify(ratings))]);
}

export async function deleteSelfGrowth(db: MissionDatabase, userId: string, id: string) {
  return Boolean(await db.prepare("DELETE FROM player_growth_records WHERE id = ? AND user_id = ? AND source = 'self' RETURNING id").bind(id, userId).first());
}
