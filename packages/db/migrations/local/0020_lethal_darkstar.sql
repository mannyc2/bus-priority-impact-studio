CREATE TABLE `local_dot_traffic_speed` (
	`link_id` text NOT NULL,
	`sampled_at` text NOT NULL,
	`speed` real,
	`travel_time` real,
	`status_code` text NOT NULL,
	`owner` text,
	`borough` text,
	`link_name` text,
	`link_points` text,
	`transcom_id` text,
	PRIMARY KEY(`link_id`, `sampled_at`)
);
