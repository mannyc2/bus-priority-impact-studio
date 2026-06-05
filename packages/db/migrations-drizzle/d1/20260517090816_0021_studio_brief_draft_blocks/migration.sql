CREATE TABLE `studio_brief_draft_block` (
	`brief_id` text NOT NULL,
	`block_id` text NOT NULL,
	`block_type` text NOT NULL,
	`block_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`brief_id`, `block_id`)
);
--> statement-breakpoint
CREATE INDEX `studio_brief_draft_block_brief_type_idx` ON `studio_brief_draft_block` (`brief_id`,`block_type`);
