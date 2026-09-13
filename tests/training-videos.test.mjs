import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, root, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => { await vite.close(); });
const store = await vite.ssrLoadModule("/lib/training-video-rankings.ts");
const migration = await readFile(new URL("../drizzle/0006_training_video_rankings.sql", import.meta.url), "utf8");

function database() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec(migration);
  const prepare = (sql, values = []) => ({
    bind(...next) { return prepare(sql, next); },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    run() { return sqlite.prepare(sql).run(...values); },
  });
  return { sqlite, prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const result = statements.map(statement => statement.run()); sqlite.exec("COMMIT"); return result; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
}

test("YouTube URL validation accepts canonical, short and shorts links only", () => {
  assert.equal(store.youtubeVideoId("https://www.youtube.com/watch?v=Smozh3gEFV4"), "Smozh3gEFV4");
  assert.equal(store.youtubeVideoId("https://youtu.be/Smozh3gEFV4?t=10"), "Smozh3gEFV4");
  assert.equal(store.youtubeVideoId("https://youtube.com/shorts/Smozh3gEFV4"), "Smozh3gEFV4");
  assert.equal(store.youtubeVideoId("https://example.com/watch?v=Smozh3gEFV4"), null);
});

test("community ranking deduplicates videos and counts one selection per user", async () => {
  const db = database();
  try {
    const input = { url: "https://youtu.be/Smozh3gEFV4", title: "正しいエイム練習法", creator: "Lazvell", mode: "aim", summary: "AIM練習" };
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-a", input)).ok, true);
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-a", input)).ok, true);
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-b", input)).ok, true);
    let ranking = await store.getCommunityTrainingVideos(db, "user-a");
    assert.equal(ranking.length, 1); assert.equal(ranking[0].voteCount, 2); assert.equal(ranking[0].selected, true);
    assert.equal(await store.selectCommunityTrainingVideo(db, "user-a", "Smozh3gEFV4", false), true);
    ranking = await store.getCommunityTrainingVideos(db, "user-a");
    assert.equal(ranking[0].voteCount, 1); assert.equal(ranking[0].selected, false);
  } finally { db.sqlite.close(); }
});
