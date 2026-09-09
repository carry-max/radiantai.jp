CREATE TABLE `analysis_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analysis_locks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analysis_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period_key` text NOT NULL,
	`recording_id` text NOT NULL,
	`scene_key` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`feedback` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_user_period_recording` ON `analysis_records` (`user_id`,`period_key`,`recording_id`);