ALTER TABLE `route_speed_history_coverage` ADD COLUMN `spine_readiness` text;
--> statement-breakpoint
ALTER TABLE `route_speed_history_coverage` ADD COLUMN `spine_reason_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `route_speed_history_coverage` ADD COLUMN `matched_current_segment_count` integer;
--> statement-breakpoint
ALTER TABLE `route_speed_history_coverage` ADD COLUMN `unmatched_current_segment_count` integer;
