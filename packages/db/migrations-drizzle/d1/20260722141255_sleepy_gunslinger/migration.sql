CREATE TABLE `exact_route_identity_release` (
	`release_id` text PRIMARY KEY,
	`published_at` text NOT NULL,
	`coverage_start` text,
	`coverage_end` text NOT NULL,
	`source_wiki_release` text NOT NULL,
	`source_manifest_sha256` text NOT NULL,
	`source_route_identity_sha256` text NOT NULL,
	`source_current_bus_routes_sha256` text NOT NULL,
	`source_index_sha256` text NOT NULL,
	`catalog_snapshot_sha256` text NOT NULL,
	`projection_sha256` text NOT NULL,
	`exact_route_count` integer NOT NULL,
	`route_type_count` integer NOT NULL,
	`trip_type_count` integer NOT NULL
);
