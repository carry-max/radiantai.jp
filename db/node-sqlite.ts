import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new Statement(this.db, this.sql, values); }
  execute() {
    const statement = this.db.prepare(this.sql);
    if (statement.columns().length) return { results: statement.all(...this.values), success: true };
    const result = statement.run(...this.values);
    return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async all<T>() { return this.execute() as { results: T[]; success: boolean }; }
  async first<T>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return this.execute(); }
  async raw() {
    const statement = this.db.prepare(this.sql);
    statement.setReturnArrays(true);
    return statement.all(...this.values);
  }
}

export class SqliteDatabase {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  }
  prepare(sql: string) { return new Statement(this.db, sql); }
  async batch(statements: Statement[]) {
    // No awaits inside the transaction: another request cannot interleave.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => statement.execute());
      this.db.exec("COMMIT");
      return results;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  migrate(directory: string) {
    this.db.exec("CREATE TABLE IF NOT EXISTS rr_node_migrations (tag TEXT PRIMARY KEY)");
    const journal = JSON.parse(readFileSync(resolve(directory, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const { tag } of journal.entries) {
        if (this.db.prepare("SELECT tag FROM rr_node_migrations WHERE tag = ?").get(tag)) continue;
        this.db.exec(readFileSync(resolve(directory, tag + ".sql"), "utf8"));
        this.db.prepare("INSERT INTO rr_node_migrations (tag) VALUES (?)").run(tag);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
}

const runtime = globalThis as typeof globalThis & { radiantDatabase?: SqliteDatabase };
export function getSqliteDatabase() {
  if (!runtime.radiantDatabase) {
    const database = new SqliteDatabase(process.env.SQLITE_PATH || resolve(process.cwd(), ".data/radiant.sqlite"));
    try { database.migrate(resolve(process.cwd(), "drizzle")); }
    catch (error) { database.close(); throw error; }
    runtime.radiantDatabase = database;
  }
  return runtime.radiantDatabase;
}
