CREATE TABLE IF NOT EXISTS `studio_brief_draft_ref` (
	`brief_id` text NOT NULL,
	`ref_id` text NOT NULL,
	`ref_kind` text NOT NULL,
	`ref_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`brief_id`, `ref_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_draft_ref_brief_kind_idx` ON `studio_brief_draft_ref` (`brief_id`,`ref_kind`);
