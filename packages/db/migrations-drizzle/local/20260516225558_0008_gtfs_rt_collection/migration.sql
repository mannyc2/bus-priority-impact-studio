CREATE TABLE `local_gtfs_rt_collection_run` (
	`run_id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text NOT NULL,
	`requested_duration_seconds` integer NOT NULL,
	`sample_seconds` integer NOT NULL,
	`requested_feed_types` text NOT NULL,
	`snapshot_count` integer NOT NULL,
	`success_count` integer NOT NULL,
	`failure_count` integer NOT NULL,
	`raw_directory` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `local_gtfs_rt_feed_snapshot` (
	`run_id` text NOT NULL,
	`feed_type` text NOT NULL,
	`sample_index` integer NOT NULL,
	`source_id` text NOT NULL,
	`fetched_at` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`byte_length` integer,
	`sha256` text,
	`raw_path` text,
	`redacted_url` text NOT NULL,
	`error` text,
	PRIMARY KEY(`run_id`, `feed_type`, `sample_index`)
);
