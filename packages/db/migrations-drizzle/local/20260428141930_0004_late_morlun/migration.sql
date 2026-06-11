CREATE TABLE `local_bus_lane` (
	`segment_id` text PRIMARY KEY NOT NULL,
	`street` text NOT NULL,
	`borough` text NOT NULL,
	`facility` text NOT NULL,
	`direction` text,
	`traffic_direction` text,
	`hours` text,
	`days` text,
	`lane_type` text,
	`lane_subtype` text,
	`lane_width` text,
	`open_date` text,
	`shape_length` real
);
--> statement-breakpoint
CREATE TABLE `local_bus_lane_coordinate` (
	`segment_id` text NOT NULL,
	`coordinate_rank` integer NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	PRIMARY KEY(`segment_id`, `coordinate_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_stop` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`stop_id` text NOT NULL,
	`route_short_name` text NOT NULL,
	`stop_name` text NOT NULL,
	`in_effect` integer NOT NULL,
	`direction_id` text NOT NULL,
	`direction` text NOT NULL,
	`timepoint` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `stop_id`, `direction_id`)
);
