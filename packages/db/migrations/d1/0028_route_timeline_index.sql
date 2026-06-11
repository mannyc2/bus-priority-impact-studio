CREATE TABLE `route_timeline_index` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`support_level` text NOT NULL,
	`quality_flags_json` text NOT NULL,
	`default_event_count` integer NOT NULL,
	`secondary_event_count` integer NOT NULL,
	`review_only_event_count` integer NOT NULL,
	`event_count` integer NOT NULL,
	`source_backed_event_count` integer NOT NULL,
	`date_assertion_backed_event_count` integer NOT NULL,
	`unresolved_date_event_count` integer NOT NULL,
	`low_confidence_event_count` integer NOT NULL,
	`unaccounted_candidate_count` integer NOT NULL,
	`validation_error_count` integer NOT NULL,
	`validation_warning_count` integer NOT NULL,
	`total_tokens` integer,
	`default_events_json` text NOT NULL,
	`bundle_artifact_key` text NOT NULL,
	`bundle_artifact_sha256` text NOT NULL,
	`bundle_artifact_byte_length` integer NOT NULL,
	`source_bundle_path` text NOT NULL,
	`generated_at` text NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE INDEX `route_timeline_index_month_support_idx` ON `route_timeline_index` (`month`, `support_level`);
