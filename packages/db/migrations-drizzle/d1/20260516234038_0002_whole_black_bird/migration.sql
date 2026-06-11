CREATE TABLE `intervention_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`intervention_type` text NOT NULL,
	`source_id` text NOT NULL,
	`program` text NOT NULL,
	`implementation_date` text NOT NULL,
	`implementation_month` text NOT NULL,
	`event_status` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_intervention_comparison` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`event_id` text NOT NULL,
	`intervention_type` text NOT NULL,
	`source_id` text NOT NULL,
	`evaluation_level` text NOT NULL,
	`comparison_status` text NOT NULL,
	`pre_start_month` text,
	`pre_end_month` text,
	`post_start_month` text,
	`post_end_month` text,
	`requested_pre_month_count` integer NOT NULL,
	`requested_post_month_count` integer NOT NULL,
	`pre_sample_month_count` integer NOT NULL,
	`post_sample_month_count` integer NOT NULL,
	`pre_speed_observation_count` integer NOT NULL,
	`post_speed_observation_count` integer NOT NULL,
	`pre_average_speed_mph` real,
	`post_average_speed_mph` real,
	`speed_delta_mph` real,
	`pre_average_monthly_ridership` real,
	`post_average_monthly_ridership` real,
	`ridership_delta` real,
	`caveat` text NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `event_id`)
);
