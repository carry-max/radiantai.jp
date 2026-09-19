import postgres from "postgres";

type DatabaseValue = string | number | boolean | null;
type ResultRow = Record<string, unknown>;
type QueryResult = ResultRow[] & { count?: number };
type QueryClient = {
  unsafe(query: string, parameters?: readonly DatabaseValue[]): Promise<QueryResult>;
};

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS billing_entitlements (
  user_id text PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  plan text NOT NULL,
  status text NOT NULL,
  payment_provider text NOT NULL DEFAULT 'stripe',
  checkout_session_id text NOT NULL,
  subscription_id text,
  starts_at text NOT NULL,
  ends_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_payments (
  checkout_session_id text PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL DEFAULT '',
  plan text NOT NULL,
  amount_yen integer NOT NULL,
  paid_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS monthly_mission_cycles (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  started_at text NOT NULL,
  ends_at text NOT NULL,
  baseline_focus text NOT NULL,
  tasks_json text NOT NULL,
  current_step integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_monthly_cycles_user_started ON monthly_mission_cycles (user_id, started_at);
CREATE TABLE IF NOT EXISTS monthly_mission_reviews (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES monthly_mission_cycles(id),
  user_id text NOT NULL,
  recording_id text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,
  confidence text NOT NULL,
  evidence text NOT NULL,
  evidence_times_json text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_reviews_user_recording ON monthly_mission_reviews (user_id, recording_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reviews_user_cycle ON monthly_mission_reviews (user_id, cycle_id);
CREATE TABLE IF NOT EXISTS analysis_budgets (
  id text PRIMARY KEY,
  used integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS analysis_locks (
  user_id text PRIMARY KEY,
  token text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis_records (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  period_key text NOT NULL,
  recording_id text NOT NULL,
  scene_key text NOT NULL,
  status text NOT NULL,
  result_json text NOT NULL DEFAULT '{}',
  usage_json text NOT NULL DEFAULT '{}',
  feedback text,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_user_period_recording ON analysis_records (user_id, period_key, recording_id);
CREATE TABLE IF NOT EXISTS player_growth_records (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  source text NOT NULL,
  analysis_id text,
  recorded_at text NOT NULL,
  label text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  ratings_json text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_user_analysis ON player_growth_records (user_id, analysis_id);
CREATE INDEX IF NOT EXISTS idx_growth_user_source_date ON player_growth_records (user_id, source, recorded_at);
CREATE TABLE IF NOT EXISTS training_videos (
  id text PRIMARY KEY,
  video_id text NOT NULL UNIQUE,
  url text NOT NULL,
  title text NOT NULL,
  creator text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('aim', 'tactics')),
  rank_group text NOT NULL DEFAULT 'iron-silver',
  summary text NOT NULL DEFAULT '',
  submitted_by text NOT NULL,
  created_at text NOT NULL,
  approved integer NOT NULL DEFAULT 1 CHECK (approved IN (0, 1))
);
ALTER TABLE training_videos ADD COLUMN IF NOT EXISTS rank_group text NOT NULL DEFAULT 'iron-silver';
CREATE INDEX IF NOT EXISTS idx_training_videos_mode_created ON training_videos (mode, created_at);
CREATE INDEX IF NOT EXISTS idx_training_videos_rank_group_created ON training_videos (rank_group, created_at);
CREATE TABLE IF NOT EXISTS training_video_votes (
  video_id text NOT NULL REFERENCES training_videos(video_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at text NOT NULL,
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_training_video_votes_user ON training_video_votes (user_id);
ALTER TABLE training_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_video_votes ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS auth_accounts (
  subject text PRIMARY KEY,
  user_id text NOT NULL,
  created_at text NOT NULL,
  locked_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_user_id_unique ON auth_accounts (user_id);
CREATE TABLE IF NOT EXISTS riot_connections (
  user_id text PRIMARY KEY,
  riot_subject text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Riotプレイヤー',
  linked_at text NOT NULL
);
ALTER TABLE riot_connections ENABLE ROW LEVEL SECURITY;
`;

export function postgresPlaceholders(query: string) {
  let index = 0;
  let quoted = false;
  let output = "";
  for (let position = 0; position < query.length; position++) {
    const character = query[position];
    if (character === "'") {
      output += character;
      if (quoted && query[position + 1] === "'") output += query[++position];
      else quoted = !quoted;
    } else if (character === "?" && !quoted) output += `$${++index}`;
    else output += character;
  }
  return output;
}

class PostgresStatement {
  constructor(
    private database: PostgresDatabase,
    private query: string,
    private values: DatabaseValue[] = [],
  ) {}

  bind(...values: DatabaseValue[]) {
    return new PostgresStatement(this.database, this.query, values);
  }

  async execute(client?: QueryClient) {
    return (client || await this.database.ready()).unsafe(postgresPlaceholders(this.query), this.values);
  }

  async all<T>() {
    return { results: await this.execute() as T[], success: true };
  }

  async first<T>() {
    return (await this.all<T>()).results[0] ?? null;
  }

  async run() {
    const result = await this.execute();
    return { results: result, success: true, meta: { changes: result.count ?? result.length } };
  }

  async raw() {
    return (await this.execute()).map(row => Object.values(row));
  }
}

export class PostgresDatabase {
  private client;
  private initialized: Promise<QueryClient>;

  constructor(url: string, initializeSchema = true) {
    this.client = postgres(url, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: "require",
    });
    this.initialized = initializeSchema ? this.migrate() : Promise.resolve(this.client as unknown as QueryClient);
  }

  private async migrate() {
    await this.client.begin(async transaction => {
      await transaction.unsafe("SELECT pg_advisory_xact_lock(8241979196833690721::bigint)");
      for (const statement of POSTGRES_SCHEMA.split(";").map(value => value.trim()).filter(Boolean)) {
        await transaction.unsafe(statement);
      }
    });
    return this.client as unknown as QueryClient;
  }

  ready() {
    return this.initialized;
  }

  prepare(query: string) {
    return new PostgresStatement(this, query);
  }

  async batch(statements: PostgresStatement[]) {
    await this.ready();
    return this.client.begin(async transaction => {
      const client = transaction as unknown as QueryClient;
      const results = [];
      for (const statement of statements) {
        const result = await statement.execute(client);
        results.push({ results: result, success: true, meta: { changes: result.count ?? result.length } });
      }
      return results;
    });
  }

  async close() {
    await this.client.end({ timeout: 5 });
  }
}

const runtime = globalThis as typeof globalThis & { radiantPostgres?: PostgresDatabase; radiantPostgresUrl?: string };
const scopedRuntime = globalThis as typeof globalThis & { radiantScopedPostgres?: PostgresDatabase; radiantScopedPostgresUrl?: string };

export function getPostgresDatabase(url: string) {
  if (!runtime.radiantPostgres || runtime.radiantPostgresUrl !== url) {
    runtime.radiantPostgres = new PostgresDatabase(url);
    runtime.radiantPostgresUrl = url;
  }
  return runtime.radiantPostgres;
}

export function getScopedPostgresDatabase(url: string) {
  if (!scopedRuntime.radiantScopedPostgres || scopedRuntime.radiantScopedPostgresUrl !== url) {
    scopedRuntime.radiantScopedPostgres = new PostgresDatabase(url, false);
    scopedRuntime.radiantScopedPostgresUrl = url;
  }
  return scopedRuntime.radiantScopedPostgres;
}
