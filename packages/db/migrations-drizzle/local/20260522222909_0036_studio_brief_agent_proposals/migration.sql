CREATE TABLE IF NOT EXISTS `studio_brief_agent_run` (
	`run_id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`workspace_id` text,
	`status` text NOT NULL,
	`intent` text NOT NULL,
	`base_version_id` text NOT NULL,
	`base_content_hash` text NOT NULL,
	`trigger_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_display_name` text,
	`model_provider` text,
	`model_id` text,
	`prompt_hash` text,
	`proposal_id` text,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_agent_run_brief_status_idx` ON `studio_brief_agent_run` (`brief_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_brief_agent_proposal` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`status` text NOT NULL,
	`base_version_id` text NOT NULL,
	`base_content_hash` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`operations_json` text NOT NULL,
	`validation_json` text,
	`preview_hash` text NOT NULL,
	`provenance_json` text NOT NULL,
	`accepted_operation_ids_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`applied_at` text,
	`rejected_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_agent_proposal_run_idx` ON `studio_brief_agent_proposal` (`run_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_agent_proposal_brief_status_idx` ON `studio_brief_agent_proposal` (`brief_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_brief_draft_version` (
	`version_id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`parent_version_id` text,
	`content_hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`reason` text NOT NULL,
	`source_run_id` text,
	`source_proposal_id` text,
	`validation_score` integer,
	`snapshot_storage` text NOT NULL,
	`snapshot_key` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_draft_version_brief_created_idx` ON `studio_brief_draft_version` (`brief_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_brief_draft_version_snapshot` (
	`snapshot_key` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_draft_version_snapshot_brief_idx` ON `studio_brief_draft_version_snapshot` (`brief_id`,`created_at`);
