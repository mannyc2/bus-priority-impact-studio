CREATE TABLE `studio_brief_draft` (
	`brief_id` text PRIMARY KEY NOT NULL,
	`route_slug` text NOT NULL,
	`source_brief_id` text,
	`from_finding_id` text,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`dek` text NOT NULL,
	`summary` text NOT NULL,
	`version` text NOT NULL,
	`job_id` text NOT NULL,
	`validation_score` integer,
	`validation_weak_claims_json` text,
	`validation_missing_evidence_json` text,
	`validation_blocking_issues_json` text,
	`last_validated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE TABLE `studio_brief_draft_claim` (
	`brief_id` text NOT NULL,
	`claim_n` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`strength` integer NOT NULL,
	`evidence_ids_json` text NOT NULL,
	`caveat_ids_json` text NOT NULL,
	`state` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`brief_id`, `claim_n`)
);
--> statement-breakpoint
CREATE TABLE `studio_brief_review_comment` (
	`comment_id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_brief_write_idempotency` (
	`idempotency_key` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`idempotency_key`, `method`, `path`)
);
