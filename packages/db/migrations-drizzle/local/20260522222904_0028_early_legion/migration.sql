CREATE TABLE `local_parking_violation_match` (
	`location_key` text NOT NULL,
	`match_rank` integer NOT NULL,
	`match_kind` text NOT NULL,
	`confidence` text NOT NULL,
	`violation_code` integer NOT NULL,
	`violation_county` text,
	`street_name` text,
	`intersecting_street` text,
	`physical_id` text NOT NULL,
	`route_id` text NOT NULL,
	`candidate_count` integer NOT NULL,
	`route_fanout` integer NOT NULL,
	`match_weight` real NOT NULL,
	`event_count` integer NOT NULL,
	`matched_at` text NOT NULL,
	`evidence_json` text NOT NULL,
	PRIMARY KEY(`location_key`, `match_rank`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_match_route_idx` ON `local_parking_violation_match` (`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_match_physical_idx` ON `local_parking_violation_match` (`physical_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_match_kind_idx` ON `local_parking_violation_match` (`match_kind`,`confidence`);--> statement-breakpoint
ALTER TABLE `local_lion_segment` ADD `borough_code` text;--> statement-breakpoint
ALTER TABLE `local_lion_segment` ADD `l_low_hn` text;--> statement-breakpoint
ALTER TABLE `local_lion_segment` ADD `l_high_hn` text;--> statement-breakpoint
ALTER TABLE `local_lion_segment` ADD `r_low_hn` text;--> statement-breakpoint
ALTER TABLE `local_lion_segment` ADD `r_high_hn` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `street_code1` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `street_code2` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `street_code3` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `intersecting_street` text;--> statement-breakpoint
ALTER TABLE `local_parking_violation` ADD `match_location_key` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_pending_geocode_idx` ON `local_parking_violation` (`issue_date`,`house_number`,`street_name`,`violation_county`,`physical_id`,`geocode_confidence`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_pending_geocode_address_idx` ON `local_parking_violation` (`house_number`,`street_name`,`violation_county`,`issue_date`,`physical_id`,`geocode_confidence`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_match_location_idx` ON `local_parking_violation` (`match_location_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_parking_violation_street_code_idx` ON `local_parking_violation` (`violation_county`,`street_code1`,`house_number`);
