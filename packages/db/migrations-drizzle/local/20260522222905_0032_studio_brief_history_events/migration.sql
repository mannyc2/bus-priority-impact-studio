CREATE TABLE `studio_brief_history_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`event_seq` integer NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL,
	`draft_version` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_brief_history_event_brief_seq_idx` ON `studio_brief_history_event` (`brief_id`,`event_seq`);
