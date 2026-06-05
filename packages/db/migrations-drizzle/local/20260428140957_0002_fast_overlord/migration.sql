CREATE TABLE `local_route_hourly_ridership` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`day_of_week` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`ridership` real NOT NULL,
	`transfers` real NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `day_of_week`, `hour_of_day`)
);
--> statement-breakpoint
CREATE TABLE `local_route_segment_speed` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`row_rank` integer NOT NULL,
	`timestamp` text NOT NULL,
	`day_of_week` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`direction` text NOT NULL,
	`borough` text NOT NULL,
	`route_type` text NOT NULL,
	`stop_order` integer NOT NULL,
	`timepoint_stop_id` text NOT NULL,
	`timepoint_stop_name` text NOT NULL,
	`timepoint_stop_latitude` real NOT NULL,
	`timepoint_stop_longitude` real NOT NULL,
	`next_timepoint_stop_id` text NOT NULL,
	`next_timepoint_stop_name` text NOT NULL,
	`next_timepoint_stop_latitude` real NOT NULL,
	`next_timepoint_stop_longitude` real NOT NULL,
	`road_distance_miles` real NOT NULL,
	`average_travel_time_minutes` real NOT NULL,
	`average_road_speed_mph` real NOT NULL,
	`bus_trip_count` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `row_rank`)
);
