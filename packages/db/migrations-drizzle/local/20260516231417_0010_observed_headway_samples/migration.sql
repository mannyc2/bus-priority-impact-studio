CREATE TABLE `local_observed_headway_sample` (
	`run_id` text NOT NULL,
	`sample_rank` integer NOT NULL,
	`route_id` text NOT NULL,
	`source_route_id` text,
	`direction_id` integer,
	`stop_id` text NOT NULL,
	`previous_vehicle_key` text NOT NULL,
	`vehicle_key` text NOT NULL,
	`previous_observed_timestamp` integer NOT NULL,
	`observed_timestamp` integer NOT NULL,
	`headway_seconds` integer NOT NULL,
	`headway_minutes` real NOT NULL,
	PRIMARY KEY(`run_id`, `sample_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_observed_vehicle_stop_event` (
	`run_id` text NOT NULL,
	`event_rank` integer NOT NULL,
	`route_id` text NOT NULL,
	`source_route_id` text,
	`direction_id` integer,
	`stop_id` text NOT NULL,
	`vehicle_key` text NOT NULL,
	`vehicle_id` text,
	`vehicle_label` text,
	`trip_id` text,
	`observed_timestamp` integer NOT NULL,
	`sample_index` integer NOT NULL,
	`current_status` text,
	`latitude` real,
	`longitude` real,
	PRIMARY KEY(`run_id`, `event_rank`)
);
