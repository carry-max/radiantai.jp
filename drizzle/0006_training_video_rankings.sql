CREATE TABLE `training_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`creator` text NOT NULL,
	`mode` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`submitted_by` text NOT NULL,
	`created_at` text NOT NULL,
	`approved` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_videos_video_id_unique` ON `training_videos` (`video_id`);
--> statement-breakpoint
CREATE INDEX `idx_training_videos_mode_created` ON `training_videos` (`mode`,`created_at`);
--> statement-breakpoint
CREATE TABLE `training_video_votes` (
	`video_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `training_videos`(`video_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_training_video_votes_video_user` ON `training_video_votes` (`video_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_training_video_votes_user` ON `training_video_votes` (`user_id`);
