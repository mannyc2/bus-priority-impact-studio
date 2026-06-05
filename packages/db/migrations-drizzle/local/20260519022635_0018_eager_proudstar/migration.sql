CREATE TABLE `local_bus_wait_assessment` (
	`month` text NOT NULL,
	`route_id` text NOT NULL,
	`borough` text NOT NULL,
	`day_type` integer NOT NULL,
	`trip_type` text NOT NULL,
	`period` text NOT NULL,
	`trips_passing_wait` integer NOT NULL,
	`scheduled_trips` integer NOT NULL,
	`wait_assessment` real NOT NULL,
	PRIMARY KEY(`month`, `route_id`, `day_type`, `trip_type`, `period`)
);
