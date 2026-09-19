import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const authAccounts = sqliteTable("auth_accounts", {
  subject: text("subject").primaryKey(),
  userId: text("user_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
  lockedAt: text("locked_at"),
});

export const billingEntitlements = sqliteTable("billing_entitlements", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull().default(""),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  paymentProvider: text("payment_provider").notNull().default("stripe"),
  checkoutSessionId: text("checkout_session_id").notNull(),
  subscriptionId: text("subscription_id"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const billingPayments = sqliteTable("billing_payments", {
  checkoutSessionId: text("checkout_session_id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull().default(""),
  plan: text("plan").notNull(),
  amountYen: integer("amount_yen").notNull(),
  paidAt: text("paid_at").notNull(),
});

export const monthlyMissionCycles = sqliteTable("monthly_mission_cycles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  startedAt: text("started_at").notNull(),
  endsAt: text("ends_at").notNull(),
  baselineFocus: text("baseline_focus").notNull(),
  tasksJson: text("tasks_json").notNull(),
  currentStep: integer("current_step").notNull().default(0),
  xp: integer("xp").notNull().default(0),
}, (table) => [index("idx_monthly_cycles_user_started").on(table.userId, table.startedAt)]);

export const monthlyMissionReviews = sqliteTable("monthly_mission_reviews", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => monthlyMissionCycles.id),
  userId: text("user_id").notNull(),
  recordingId: text("recording_id").notNull(),
  step: integer("step").notNull(),
  status: text("status").notNull(),
  confidence: text("confidence").notNull(),
  evidence: text("evidence").notNull(),
  evidenceTimesJson: text("evidence_times_json").notNull(),
  xp: integer("xp").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_monthly_reviews_user_recording").on(table.userId, table.recordingId),
  index("idx_monthly_reviews_user_cycle").on(table.userId, table.cycleId),
]);

export const analysisLocks = sqliteTable("analysis_locks", {
  userId: text("user_id").primaryKey(), token: text("token").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const analysisBudgets = sqliteTable("analysis_budgets", {
  id: text("id").primaryKey(), used: integer("used").notNull().default(0),
});
export const analysisRecords = sqliteTable("analysis_records", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), periodKey: text("period_key").notNull(),
  recordingId: text("recording_id").notNull(), sceneKey: text("scene_key").notNull(), status: text("status").notNull(),
  resultJson: text("result_json").notNull().default("{}"), usageJson: text("usage_json").notNull().default("{}"),
  feedback: text("feedback"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_analysis_user_period_recording").on(table.userId, table.periodKey, table.recordingId)]);

export const playerGrowthRecords = sqliteTable("player_growth_records", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), source: text("source").notNull(),
  analysisId: text("analysis_id"), recordedAt: text("recorded_at").notNull(),
  label: text("label").notNull().default(""), note: text("note").notNull().default(""), ratingsJson: text("ratings_json").notNull(),
}, (table) => [
  uniqueIndex("idx_growth_user_analysis").on(table.userId, table.analysisId),
  index("idx_growth_user_source_date").on(table.userId, table.source, table.recordedAt),
]);

export const trainingVideos = sqliteTable("training_videos", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull().unique(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  creator: text("creator").notNull(),
  mode: text("mode").notNull(),
  rankGroup: text("rank_group").notNull().default("iron-silver"),
  summary: text("summary").notNull().default(""),
  submittedBy: text("submitted_by").notNull(),
  createdAt: text("created_at").notNull(),
  approved: integer("approved").notNull().default(1),
}, (table) => [
  index("idx_training_videos_mode_created").on(table.mode, table.createdAt),
  index("idx_training_videos_rank_group_created").on(table.rankGroup, table.createdAt),
]);

export const trainingVideoVotes = sqliteTable("training_video_votes", {
  videoId: text("video_id").notNull().references(() => trainingVideos.videoId),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_training_video_votes_video_user").on(table.videoId, table.userId),
  index("idx_training_video_votes_user").on(table.userId),
]);
