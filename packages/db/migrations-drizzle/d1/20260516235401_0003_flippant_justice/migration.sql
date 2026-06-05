CREATE TABLE `corridor` (
	`corridor_id` text PRIMARY KEY NOT NULL,
	`corridor_name` text NOT NULL,
	`corridor_key` text NOT NULL,
	`derivation_method` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corridor_hotspot` (
	`corridor_id` text NOT NULL,
	`month` text NOT NULL,
	`corridor_hotspot_rank` integer NOT NULL,
	`route_id` text NOT NULL,
	`route_hotspot_rank` integer NOT NULL,
	`from_stop_name` text NOT NULL,
	`to_stop_name` text NOT NULL,
	`weighted_average_speed_mph` real NOT NULL,
	`hotspot_score` integer NOT NULL,
	`rider_impact_score` integer,
	PRIMARY KEY(`corridor_id`, `month`, `corridor_hotspot_rank`)
);
--> statement-breakpoint
CREATE TABLE `corridor_month_summary` (
	`corridor_id` text NOT NULL,
	`month` text NOT NULL,
	`route_count` integer NOT NULL,
	`assigned_route_count` integer NOT NULL,
	`ambiguous_route_count` integer NOT NULL,
	`unassigned_route_count` integer NOT NULL,
	`total_ridership` real NOT NULL,
	`total_transfers` real NOT NULL,
	`weighted_average_speed_mph` real,
	`hotspot_count` integer NOT NULL,
	`observed_reliability_route_count` integer NOT NULL,
	`insufficient_reliability_route_count` integer NOT NULL,
	`intervention_comparison_count` integer NOT NULL,
	`evaluated_intervention_comparison_count` integer NOT NULL,
	PRIMARY KEY(`corridor_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `corridor_route_member` (
	`corridor_id` text NOT NULL,
	`month` text NOT NULL,
	`route_id` text NOT NULL,
	`assignment_status` text NOT NULL,
	`assignment_reason` text NOT NULL,
	`stop_count` integer NOT NULL,
	`matched_stop_count` integer NOT NULL,
	`hotspot_count` integer NOT NULL,
	`total_ridership` real NOT NULL,
	`average_speed_mph` real NOT NULL,
	PRIMARY KEY(`corridor_id`, `month`, `route_id`)
);
