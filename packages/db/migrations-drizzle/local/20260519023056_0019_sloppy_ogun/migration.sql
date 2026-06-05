PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_local_bus_wait_assessment` (
	`month` text NOT NULL,
	`route_id` text NOT NULL,
	`borough` text NOT NULL,
	`day_type` integer NOT NULL,
	`trip_type` text NOT NULL,
	`period` text NOT NULL,
	`trips_passing_wait` integer NOT NULL,
	`scheduled_trips` integer NOT NULL,
	`wait_assessment` real,
	PRIMARY KEY(`month`, `route_id`, `day_type`, `trip_type`, `period`)
);
--> statement-breakpoint
INSERT INTO `__new_local_bus_wait_assessment`("month", "route_id", "borough", "day_type", "trip_type", "period", "trips_passing_wait", "scheduled_trips", "wait_assessment") SELECT "month", "route_id", "borough", "day_type", "trip_type", "period", "trips_passing_wait", "scheduled_trips", "wait_assessment" FROM `local_bus_wait_assessment`;--> statement-breakpoint
DROP TABLE `local_bus_wait_assessment`;--> statement-breakpoint
ALTER TABLE `__new_local_bus_wait_assessment` RENAME TO `local_bus_wait_assessment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;