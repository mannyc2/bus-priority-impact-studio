CREATE TABLE IF NOT EXISTS `studio_brief_review_comment` (
	`comment_id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`parent_comment_id` text,
	`reviewer` text NOT NULL,
	`reviewer_display_name` text,
	`message` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'comment',
	`status` text NOT NULL DEFAULT 'open',
	`anchor_json` text,
	`suggestion_json` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_review_comment_brief_status_idx` ON `studio_brief_review_comment` (`brief_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_review_comment_parent_idx` ON `studio_brief_review_comment` (`parent_comment_id`,`created_at`);
