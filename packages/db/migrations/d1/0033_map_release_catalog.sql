CREATE TABLE `map_release_catalog` (
	`release_id` text PRIMARY KEY,
	`published_at` text NOT NULL,
	`coverage_start` text,
	`coverage_end` text NOT NULL,
	`manifest_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`release_profile` text NOT NULL,
	`verification_status` text NOT NULL,
	`route_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_release_catalog_manifest_key_idx` ON `map_release_catalog` (`manifest_key`);
