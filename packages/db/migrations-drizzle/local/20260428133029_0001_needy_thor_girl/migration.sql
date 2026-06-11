CREATE TABLE `local_route_artifact` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`artifact_name` text NOT NULL,
	`artifact_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`sha256` text NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `artifact_name`)
);
--> statement-breakpoint
CREATE TABLE `local_route_batch_built_route` (
	`month` text NOT NULL,
	`route_rank` integer NOT NULL,
	`route_id` text NOT NULL,
	`artifact_count` integer,
	`status` text NOT NULL,
	PRIMARY KEY(`month`, `route_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_batch_issue` (
	`month` text NOT NULL,
	`issue_rank` integer NOT NULL,
	`route_id` text,
	`severity` text NOT NULL,
	`issue_code` text NOT NULL,
	`message` text NOT NULL,
	PRIMARY KEY(`month`, `issue_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_batch_status` (
	`month` text PRIMARY KEY NOT NULL,
	`generated_at` text NOT NULL,
	`status` text NOT NULL,
	`route_count` integer NOT NULL,
	`artifact_count` integer NOT NULL,
	`missing_artifact_count` integer NOT NULL,
	`hash_mismatch_count` integer NOT NULL,
	`byte_length_mismatch_count` integer NOT NULL,
	`total_byte_length` integer NOT NULL,
	`issue_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_route_brief_peak_window` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`window_rank` integer NOT NULL,
	`day_of_week` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`ridership` real,
	`transfers` real,
	`matched_observation_count` integer,
	`bus_trip_count` integer,
	`weighted_average_speed_mph` real,
	`slow_observation_share` real,
	PRIMARY KEY(`route_id`, `month`, `window_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_brief_slowest_window` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`window_rank` integer NOT NULL,
	`day_of_week` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`observation_count` integer,
	`bus_trip_count` integer,
	`segment_count` integer,
	`weighted_average_speed_mph` real,
	`weighted_average_travel_time_minutes` real,
	`slow_observation_share` real,
	PRIMARY KEY(`route_id`, `month`, `window_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_brief_summary` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`route_score` integer NOT NULL,
	`public_visible` integer NOT NULL,
	`public_visibility_reason` text NOT NULL,
	`average_speed_mph` real NOT NULL,
	`hotspot_count` integer NOT NULL,
	`total_ridership` real NOT NULL,
	`total_transfers` real NOT NULL,
	`ace_active` integer NOT NULL,
	`ace_violation_count` integer NOT NULL,
	`bus_lane_matched_lane_count` integer NOT NULL,
	`schedule_match_rate` real NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_comparison_rank` (
	`month` text NOT NULL,
	`rank` integer NOT NULL,
	`route_id` text NOT NULL,
	`route_score` integer NOT NULL,
	`average_speed_mph` real NOT NULL,
	`total_ridership` real NOT NULL,
	`ace_violation_count` integer NOT NULL,
	`bus_lane_matched_lane_count` integer NOT NULL,
	PRIMARY KEY(`month`, `rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_equity_context` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`acs_year` integer NOT NULL,
	`assignment_geography` text NOT NULL,
	`assigned_county_fips` text,
	`assigned_county_name` text,
	`assignment_method` text NOT NULL,
	`tract_count` integer NOT NULL,
	`total_population` integer,
	`occupied_housing_units` integer,
	`no_vehicle_households` integer,
	`no_vehicle_household_share` real,
	`median_household_income` real,
	`poverty_rate` real,
	`public_transit_commuter_share` real,
	`hispanic_share` real,
	`non_hispanic_white_share` real,
	`non_hispanic_black_share` real,
	`non_hispanic_asian_share` real,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_month_source_status` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`source_scope` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`row_count` integer,
	`snapshot_id` text,
	`note` text,
	PRIMARY KEY(`route_id`, `month`, `source_scope`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `local_route_month_trend` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`speed_observation_count` integer NOT NULL,
	`speed_bus_trip_count` integer NOT NULL,
	`average_speed_mph` real,
	`ridership` real,
	`transfers` real,
	`has_speed_trend` integer NOT NULL,
	`has_ridership_trend` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_reliability_baseline` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`reliability_status` text NOT NULL,
	`scheduled_timepoint_count` integer NOT NULL,
	`stop_headway_group_count` integer NOT NULL,
	`headway_sample_count` integer NOT NULL,
	`median_scheduled_headway_minutes` real,
	`p90_scheduled_headway_minutes` real,
	`max_scheduled_headway_minutes` real,
	`scheduled_short_headway_share` real,
	`scheduled_long_gap_share` real,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `local_route_reliability_gap_window` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`window_rank` integer NOT NULL,
	`day_type` text NOT NULL,
	`direction_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`stop_name` text,
	`sample_count` integer NOT NULL,
	`median_headway_minutes` real NOT NULL,
	`p90_headway_minutes` real NOT NULL,
	`max_headway_minutes` real NOT NULL,
	PRIMARY KEY(`route_id`, `month`, `window_rank`)
);
--> statement-breakpoint
CREATE TABLE `local_route_scorecard` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`route_score` integer NOT NULL,
	`coverage_status` text NOT NULL,
	`average_speed_mph` real NOT NULL,
	`hotspot_count` integer NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
