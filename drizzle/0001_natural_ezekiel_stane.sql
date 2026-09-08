CREATE TABLE `monthly_mission_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`baseline_focus` text NOT NULL,
	`tasks_json` text NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_monthly_cycles_user_started` ON `monthly_mission_cycles` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `monthly_mission_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`step` integer NOT NULL,
	`status` text NOT NULL,
	`confidence` text NOT NULL,
	`evidence` text NOT NULL,
	`evidence_times_json` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `monthly_mission_cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monthly_reviews_user_recording` ON `monthly_mission_reviews` (`user_id`,`recording_id`);--> statement-breakpoint
CREATE INDEX `idx_monthly_reviews_user_cycle` ON `monthly_mission_reviews` (`user_id`,`cycle_id`);