CREATE TABLE `local_route_schedule_timepoint` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`row_rank` integer NOT NULL,
	`schedule_date` text NOT NULL,
	`day_type` text NOT NULL,
	`direction` text NOT NULL,
	`shape_id` text NOT NULL,
	`stop_sequence` integer NOT NULL,
	`stop_id` text NOT NULL,
	`stop_name` text,
	`schedule_time` text NOT NULL,
	`distance_from_start` real,
	`trip_headsign` text,
	`block_id` text NOT NULL,
	`bundle` text,
	PRIMARY KEY(`route_id`, `month`, `row_rank`)
);
