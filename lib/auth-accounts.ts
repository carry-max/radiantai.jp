import type { MissionDatabase } from "@/lib/monthly-store";

export async function authSubject(projectUrl: string, supabaseId: string) { return `${projectUrl}:${supabaseId}`; }

// Pin before any product mutation or external checkout. An in-flight request
// must not keep writing to an ID that a concurrent legacy import remapped.
export async function pinAccount(db: MissionDatabase, subject: string, expectedId: string) {
  const row = await db.prepare("UPDATE auth_accounts SET locked_at = COALESCE(locked_at, ?) WHERE subject = ? AND user_id = ? RETURNING user_id").bind(new Date().toISOString(), subject, expectedId).first();
  return Boolean(row);
}
export async function resolveAccount(db: MissionDatabase, subject: string): Promise<string> {
  const existing = await db.prepare("SELECT user_id FROM auth_accounts WHERE subject = ?").bind(subject).first<{ user_id: string }>();
  if (existing) return existing.user_id;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  const id = `sb:${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  await db.prepare("INSERT INTO auth_accounts (subject, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(subject) DO NOTHING").bind(subject, id, new Date().toISOString()).first();
  const account = await db.prepare("SELECT user_id FROM auth_accounts WHERE subject = ?").bind(subject).first<{ user_id: string }>();
  if (!account) throw new Error("account unavailable");
  return account.user_id;
}

// Both identities must be verified by their respective servers before calling.
// Keep the old user ID so XP, quotas and Stripe metadata continue to agree.
// Refuse merging two already-used accounts or an identity claimed by someone else.
export async function importLegacyAccount(db: MissionDatabase, subject: string, legacyId: string) {
  const currentId = await resolveAccount(db, subject);
  if (currentId === legacyId) return "already" as const;
  const row = await db.prepare(`UPDATE auth_accounts SET user_id = ? WHERE subject = ? AND user_id = ? AND locked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM auth_accounts WHERE user_id = ? AND subject <> ?)
    AND NOT EXISTS (SELECT 1 FROM billing_entitlements WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM billing_payments WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM monthly_mission_cycles WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM monthly_mission_reviews WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM analysis_records WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM player_growth_records WHERE user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM analysis_locks WHERE user_id = ?)
    RETURNING user_id`).bind(legacyId, subject, currentId, legacyId, subject, ...Array(7).fill(currentId)).first();
  return row ? "imported" as const : "conflict" as const;
}
