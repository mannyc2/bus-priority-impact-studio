ALTER TABLE `studio_brief_review_comment` ADD `parent_comment_id` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `kind` text NOT NULL DEFAULT 'comment';
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `status` text NOT NULL DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `anchor_json` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `suggestion_json` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `resolved_at` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_review_comment` ADD `resolved_by` text;
--> statement-breakpoint
CREATE INDEX `studio_brief_review_comment_brief_status_idx` ON `studio_brief_review_comment` (`brief_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `studio_brief_review_comment_parent_idx` ON `studio_brief_review_comment` (`parent_comment_id`,`created_at`);
