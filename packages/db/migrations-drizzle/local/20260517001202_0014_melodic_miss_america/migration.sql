CREATE TABLE `local_corridor_artifact` (
	`corridor_id` text NOT NULL,
	`month` text NOT NULL,
	`artifact_name` text NOT NULL,
	`artifact_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`sha256` text NOT NULL,
	PRIMARY KEY(`corridor_id`, `month`, `artifact_name`)
);
