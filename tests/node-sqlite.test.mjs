import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";

test("Node SQLite migrates, persists, maps Drizzle rows and rolls back a failed batch", async () => {
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false } });
  const dir = await mkdtemp(join(tmpdir(), "radiant-db-"));
  let db;
  try {
    const { SqliteDatabase } = await vite.ssrLoadModule("/db/node-sqlite.ts");
    const path = join(dir, "test.sqlite");
    const migrations = fileURLToPath(new URL("../drizzle", import.meta.url));
    db = new SqliteDatabase(path);
    db.migrate(migrations);
    db.migrate(migrations);
    await db.prepare("INSERT INTO auth_accounts (subject, user_id, created_at) VALUES (?, ?, ?)").bind("subject", "user", "now").run();
    assert.equal((await drizzle(db).all(sql`SELECT user_id FROM auth_accounts`))[0].user_id, "user");
    assert.deepEqual(await db.prepare("SELECT user_id FROM auth_accounts").raw(), [["user"]]);
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO auth_accounts (subject, user_id, created_at) VALUES ('other', 'other', 'now')"),
      db.prepare("INSERT INTO auth_accounts (subject, user_id, created_at) VALUES ('subject', 'duplicate', 'now')"),
    ]));
    assert.equal(await db.prepare("SELECT * FROM auth_accounts WHERE subject = 'other'").first(), null);
    db.close();
    db = new SqliteDatabase(path);
    assert.equal((await db.prepare("SELECT user_id FROM auth_accounts").first()).user_id, "user");
  } finally {
    db?.close(); await vite.close();
    // mkdtemp returns this test's unique directory within the OS temporary root.
    assert.equal(join(dir, ".."), tmpdir());
    await rm(dir, { recursive: true, force: true });
  }
});
