CREATE TABLE `studio_brief_draft_ref` (
	`brief_id` text NOT NULL,
	`ref_id` text NOT NULL,
	`ref_kind` text NOT NULL,
	`ref_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`brief_id`, `ref_id`)
);
--> statement-breakpoint
CREATE INDEX `studio_brief_draft_ref_brief_kind_idx` ON `studio_brief_draft_ref` (`brief_id`,`ref_kind`);
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `promotion_candidate_id` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `promotion_target_brief_id` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `promotion_artifact_key` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `promotion_artifact_sha256` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `promotion_recorded_at` text;
