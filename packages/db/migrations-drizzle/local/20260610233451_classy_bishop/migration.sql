CREATE TABLE `local_route_segment_speed_cell` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`cell_rank` integer NOT NULL,
	`timestamp` text NOT NULL,
	`day_of_week` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`direction` text NOT NULL,
	`borough` text NOT NULL,
	`route_type` text NOT NULL,
	`stop_order` integer NOT NULL,
	`timepoint_stop_id` text,
	`timepoint_stop_name` text,
	`timepoint_stop_latitude` real,
	`timepoint_stop_longitude` real,
	`next_timepoint_stop_id` text,
	`next_timepoint_stop_name` text,
	`next_timepoint_stop_latitude` real,
	`next_timepoint_stop_longitude` real,
	`road_distance_miles` real,
	`average_travel_time_minutes` real,
	`average_road_speed_mph` real,
	`bus_trip_count` integer,
	CONSTRAINT `local_route_segment_speed_cell_pk` PRIMARY KEY(`route_id`, `month`, `cell_rank`)
);
--> statement-breakpoint
CREATE INDEX `local_route_segment_speed_cell_month_route_idx` ON `local_route_segment_speed_cell` (`month`,`route_id`);