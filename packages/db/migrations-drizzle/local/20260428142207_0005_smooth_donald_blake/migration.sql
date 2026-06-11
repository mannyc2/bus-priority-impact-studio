CREATE TABLE `local_ace_route` (
	`route_id` text NOT NULL,
	`program` text NOT NULL,
	`implementation_date` text NOT NULL,
	PRIMARY KEY(`route_id`, `program`, `implementation_date`)
);
--> statement-breakpoint
CREATE TABLE `local_ace_violation_summary` (
	`month` text NOT NULL,
	`route_id` text NOT NULL,
	`violation_type` text NOT NULL,
	`violation_status` text NOT NULL,
	`violation_count` integer NOT NULL,
	PRIMARY KEY(`month`, `route_id`, `violation_type`, `violation_status`)
);
