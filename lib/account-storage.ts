export const LEGACY_HISTORY_KEY = "radiant-review-web-history-v1";
export const LEGACY_GROWTH_KEY = "radiant-review-web-growth-v1";
export function accountStorageKeys(userId: string) {
  return { history: `${LEGACY_HISTORY_KEY}:${userId}`, growth: `${LEGACY_GROWTH_KEY}:${userId}` };
}

// Old device-only records have no trustworthy owner field. Import them only
// after the current owner explicitly chooses to do so; never infer by email.
export function importDeviceHistory(storage: Storage, userId: string) {
  const keys = accountStorageKeys(userId);
  const pending: [string, string, string][] = [];
  for (const [oldKey, newKey] of [[LEGACY_HISTORY_KEY, keys.history], [LEGACY_GROWTH_KEY, keys.growth]]) {
    const value = storage.getItem(oldKey);
    if (!value) continue;
    const parsed = JSON.parse(value);
    if (oldKey === LEGACY_HISTORY_KEY ? !Array.isArray(parsed) : !parsed || !Number.isFinite(parsed.totalXp) || parsed.totalXp < 0) throw new Error("以前の保存データを読み取れませんでした。");
    const current = storage.getItem(newKey);
    if (current && current !== value) throw new Error("このアカウントには端末内の記録があります。上書きせずに取り込みを中止しました。");
    pending.push([oldKey, newKey, value]);
  }
  for (const [, newKey, value] of pending) storage.setItem(newKey, value);
  for (const [oldKey] of pending) storage.removeItem(oldKey);
  return pending.length > 0;
}
