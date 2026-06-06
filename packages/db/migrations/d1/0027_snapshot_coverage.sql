CREATE TABLE `route_speed_history_coverage` (
	`route_id` text NOT NULL,
	`month` text NOT NULL,
	`route_slug` text NOT NULL,
	`history_start_month` text NOT NULL,
	`history_end_month` text NOT NULL,
	`artifact_path` text NOT NULL,
	`artifact_status` text NOT NULL,
	`month_count` integer NOT NULL,
	`segment_count` integer NOT NULL,
	`cell_count` integer NOT NULL,
	`available_cell_count` integer NOT NULL,
	`missing_cell_count` integer NOT NULL,
	`generated_at` text NOT NULL,
	PRIMARY KEY(`route_id`, `month`)
);
--> statement-breakpoint
CREATE INDEX `route_speed_history_coverage_month_idx` ON `route_speed_history_coverage` (`month`);
--> statement-breakpoint
CREATE TABLE `source_month_coverage` (
	`source_id` text NOT NULL,
	`month` text NOT NULL,
	`label` text NOT NULL,
	`source_kind` text NOT NULL,
	`grain` text NOT NULL,
	`status` text NOT NULL,
	`row_count` integer,
	`route_count` integer,
	`note` text,
	`generated_at` text NOT NULL,
	`artifact_path` text,
	PRIMARY KEY(`source_id`, `month`)
);
--> statement-breakpoint
CREATE INDEX `source_month_coverage_month_idx` ON `source_month_coverage` (`month`);
