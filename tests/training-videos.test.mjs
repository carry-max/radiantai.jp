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
const catalogue = await vite.ssrLoadModule("/lib/training-videos.ts");
const migrations = await Promise.all([
  readFile(new URL("../drizzle/0006_training_video_rankings.sql", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0008_training_video_rank_groups.sql", import.meta.url), "utf8"),
]);

function database() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec(migrations.join("\n"));
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

test("rank-group migration keeps existing community videos readable", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(migrations[0]);
    sqlite.prepare(`INSERT INTO training_videos (id, video_id, url, title, creator, mode, summary, submitted_by, created_at, approved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run("old", "Smozh3gEFV4", "https://www.youtube.com/watch?v=Smozh3gEFV4", "既存動画", "Lazvell", "aim", "AIM練習", "user-a", "2026-09-01T00:00:00.000Z");
    sqlite.exec(migrations[1]);
    assert.equal(sqlite.prepare("SELECT rank_group FROM training_videos WHERE id = ?").get("old").rank_group, "iron-silver");
  } finally { sqlite.close(); }
});

test("curated catalogue contains a five-video ranking for each rank group", () => {
  assert.equal(new Set(catalogue.TRAINING_VIDEOS.map(video => video.videoId)).size, catalogue.TRAINING_VIDEOS.length);
  assert.deepEqual(catalogue.VALORANT_RANK_GROUPS.map(group => group.label), ["アイアン〜シルバー", "ゴールド〜ダイヤ", "アセンダント〜レディアント"]);
  for (const group of catalogue.VALORANT_RANK_GROUPS) {
    const ranked = catalogue.videosForRankGroup(group.id);
    assert.equal(ranked.length, 5);
    assert.equal(new Set(ranked.map(video => video.videoId)).size, 5);
  }
  for (const video of catalogue.TRAINING_VIDEOS) {
    assert.match(video.url, new RegExp(`^https://www\\.youtube\\.com/watch\\?v=${video.videoId}$`));
    assert.ok(video.title.length > 0);
    assert.ok(video.summary.length > 0);
    assert.ok(video.skills.length > 0);
  }
});

test("community ranking deduplicates videos and counts one selection per user", async () => {
  const db = database();
  try {
    const input = { url: "https://youtu.be/Smozh3gEFV4", title: "正しいエイム練習法", creator: "Lazvell", mode: "aim", rankGroup: "gold-diamond", summary: "AIM練習" };
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-a", input)).ok, true);
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-a", input)).ok, true);
    assert.equal((await store.submitCommunityTrainingVideo(db, "user-b", input)).ok, true);
    let ranking = await store.getCommunityTrainingVideos(db, "user-a");
    assert.equal(ranking.length, 1); assert.equal(ranking[0].voteCount, 2); assert.equal(ranking[0].selected, true); assert.equal(ranking[0].rankGroup, "gold-diamond");
    assert.equal(await store.selectCommunityTrainingVideo(db, "user-a", "Smozh3gEFV4", false), true);
    ranking = await store.getCommunityTrainingVideos(db, "user-a");
    assert.equal(ranking[0].voteCount, 1); assert.equal(ranking[0].selected, false);
  } finally { db.sqlite.close(); }
});
