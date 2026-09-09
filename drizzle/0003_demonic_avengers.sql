CREATE TABLE `player_growth_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`analysis_id` text,
	`recorded_at` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`ratings_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_growth_user_analysis` ON `player_growth_records` (`user_id`,`analysis_id`);--> statement-breakpoint
CREATE INDEX `idx_growth_user_source_date` ON `player_growth_records` (`user_id`,`source`,`recorded_at`);