ALTER TABLE `studio_brief_draft` ADD `job_status` text NOT NULL DEFAULT 'succeeded';
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `job_started_at` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `job_completed_at` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `job_error` text;
