CREATE TABLE `route_catalog_trip_type` (
	`route_id` text NOT NULL,
	`trip_type_rank` integer NOT NULL,
	`trip_type` text NOT NULL,
	PRIMARY KEY(`route_id`, `trip_type_rank`)
);
