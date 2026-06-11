CREATE TABLE `tier2_intervention_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`source_id` text NOT NULL,
	`intervention_type` text NOT NULL,
	`implementation_date` text NOT NULL,
	`implementation_month` text NOT NULL,
	`date_precision` text NOT NULL,
	`event_status` text NOT NULL,
	`validation_state` text NOT NULL,
	`duplicate_review_state` text NOT NULL,
	`duplicate_fingerprint` text NOT NULL,
	`promotion_state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tier2_intervention_event_route` (
	`event_id` text NOT NULL,
	`route_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `route_id`)
);
--> statement-breakpoint
CREATE TABLE `tier2_intervention_event_source_span` (
	`event_id` text NOT NULL,
	`chunk_rank` integer NOT NULL,
	`chunk_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `chunk_rank`)
);
