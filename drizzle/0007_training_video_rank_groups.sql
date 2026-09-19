ALTER TABLE `training_videos` ADD `rank_group` text DEFAULT 'iron-silver' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_training_videos_rank_group_created` ON `training_videos` (`rank_group`,`created_at`);
