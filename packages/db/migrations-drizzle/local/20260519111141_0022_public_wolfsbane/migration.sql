CREATE TABLE `local_address_geocode` (
	`raw_key` text PRIMARY KEY NOT NULL,
	`source_label` text NOT NULL,
	`input_kind` text NOT NULL,
	`input_json` text NOT NULL,
	`physical_id` text,
	`lat` real,
	`lng` real,
	`confidence` text,
	`error_reason` text,
	`geocoded_at` text NOT NULL,
	`raw_response` text
);
--> statement-breakpoint
CREATE TABLE `local_context_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_row_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`ended_at` text,
	`physical_id` text,
	`lat` real,
	`lng` real,
	`route_id` text,
	`payload_json` text NOT NULL,
	`ingested_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_finding_candidate` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`detector_id` text NOT NULL,
	`detector_run_id` text NOT NULL,
	`route_id` text,
	`physical_id` text,
	`severity` text NOT NULL,
	`claim_text` text NOT NULL,
	`window_start` text,
	`window_end` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_finding_coverage_audit` (
	`audit_id` text PRIMARY KEY NOT NULL,
	`detector_run_id` text NOT NULL,
	`detector_id` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_id` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`inputs_seen_json` text,
	`inputs_expected_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_finding_evidence_link` (
	`link_id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`evidence_kind` text NOT NULL,
	`evidence_ref` text NOT NULL,
	`evidence_weight` real,
	`note` text,
	FOREIGN KEY (`candidate_id`) REFERENCES `local_finding_candidate`(`candidate_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `local_lion_segment_geom` (
	`physical_id` text PRIMARY KEY NOT NULL,
	`built_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_route_lion_link` (
	`route_id` text NOT NULL,
	`physical_id` text NOT NULL,
	`overlap_meters` real NOT NULL,
	`buffer_meters` real NOT NULL,
	`match_kind` text NOT NULL,
	`street_name` text,
	`borough` text,
	`computed_at` text NOT NULL,
	PRIMARY KEY(`route_id`, `physical_id`)
);
--> statement-breakpoint
CREATE TABLE `local_route_shape_geom` (
	`route_id` text NOT NULL,
	`shape_id` text NOT NULL,
	`direction_id` integer,
	`route_short_name` text,
	`built_at` text NOT NULL,
	PRIMARY KEY(`route_id`, `shape_id`)
);
--> statement-breakpoint
ALTER TABLE `local_311_service_request` ADD `physical_id` text;--> statement-breakpoint
ALTER TABLE `local_311_service_request` ADD `geocode_confidence` text;--> statement-breakpoint
ALTER TABLE `local_nypd_collision` ADD `physical_id` text;--> statement-breakpoint
ALTER TABLE `local_nypd_collision` ADD `geocode_confidence` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `physical_id` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `geocode_confidence` text;