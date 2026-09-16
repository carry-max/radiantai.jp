CREATE TABLE `riot_connections` (
  `user_id` text PRIMARY KEY NOT NULL,
  `riot_subject` text NOT NULL,
  `display_name` text DEFAULT 'Riotプレイヤー' NOT NULL,
  `linked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `riot_connections_riot_subject_unique` ON `riot_connections` (`riot_subject`);
