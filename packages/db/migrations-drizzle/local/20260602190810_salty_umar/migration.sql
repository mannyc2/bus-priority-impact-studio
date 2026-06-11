CREATE TABLE `local_bus_customer_journey_metric` (
	`month` text NOT NULL,
	`route_id` text NOT NULL,
	`borough` text NOT NULL,
	`trip_type` text NOT NULL,
	`period` text NOT NULL,
	`customers` real NOT NULL,
	`additional_bus_stop_time_minutes` real,
	`additional_travel_time_minutes` real,
	`customer_journey_time_minutes` real,
	CONSTRAINT `local_bus_customer_journey_metric_pk` PRIMARY KEY(`month`, `route_id`, `trip_type`, `period`)
);
