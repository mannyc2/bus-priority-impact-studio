CREATE TABLE `local_route_build_plan` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`route_short_name` text NOT NULL,
	`route_long_name` text,
	`candidate_rank` integer,
	`plan_status` text NOT NULL,
	`selected_for_next_batch` integer NOT NULL,
	`already_built` integer NOT NULL,
	`build_eligible` integer NOT NULL,
	`priority_score` real NOT NULL,
	`readiness_status` text NOT NULL,
	`readiness_score` integer NOT NULL,
	`speed_observation_count` integer NOT NULL,
	`speed_bus_trip_count` integer NOT NULL,
	`average_speed_mph` real,
	`schedule_timepoint_count` integer NOT NULL,
	`shape_count` integer NOT NULL,
	`stop_count` integer NOT NULL,
	`timepoint_stop_count` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_catalog` (
	`route_id` text PRIMARY KEY NOT NULL,
	`route_short_name` text NOT NULL,
	`route_long_name` text,
	`shape_count` integer NOT NULL,
	`stop_count` integer NOT NULL,
	`timepoint_stop_count` integer NOT NULL,
	`latitude_min` real,
	`latitude_max` real,
	`longitude_min` real,
	`longitude_max` real
);
--> statement-breakpoint
CREATE TABLE `local_route_catalog_type` (
	`route_id` text NOT NULL,
	`type_rank` integer NOT NULL,
	`route_type` text NOT NULL,
	PRIMARY KEY(`route_id`, `type_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_direction` (
	`route_id` text NOT NULL,
	`direction_rank` integer NOT NULL,
	`direction_name` text NOT NULL,
	PRIMARY KEY(`route_id`, `direction_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_month_coverage` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`speed_observation_count` integer NOT NULL,
	`speed_bus_trip_count` integer NOT NULL,
	`average_speed_mph` real,
	`schedule_timepoint_count` integer NOT NULL,
	`has_speed_data` integer NOT NULL,
	`has_schedule_data` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_readiness` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`route_short_name` text NOT NULL,
	`route_long_name` text,
	`readiness_status` text NOT NULL,
	`build_eligible` integer NOT NULL,
	`readiness_score` integer NOT NULL,
	`speed_observation_count` integer NOT NULL,
	`speed_bus_trip_count` integer NOT NULL,
	`average_speed_mph` real,
	`schedule_timepoint_count` integer NOT NULL,
	`shape_count` integer NOT NULL,
	`stop_count` integer NOT NULL,
	`timepoint_stop_count` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_readiness_missing_input` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`input_rank` integer NOT NULL,
	`input_name` text NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `input_rank`)
);
