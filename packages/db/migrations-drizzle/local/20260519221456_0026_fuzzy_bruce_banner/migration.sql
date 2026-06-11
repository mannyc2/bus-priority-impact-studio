CREATE TABLE `local_context_event_route_touch` (
	`event_id` text NOT NULL,
	`route_id` text NOT NULL,
	`source_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`ended_at` text,
	`physical_id` text,
	`touch_kind` text NOT NULL,
	`evidence_role` text NOT NULL,
	`overlap_meters` real,
	`buffer_meters` real,
	`route_fanout` integer NOT NULL,
	`match_weight` real NOT NULL,
	`computed_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `route_id`)
);
--> statement-breakpoint
CREATE INDEX `local_context_event_route_touch_route_time_idx` ON `local_context_event_route_touch` (`route_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `local_context_event_route_touch_time_route_idx` ON `local_context_event_route_touch` (`occurred_at`,`route_id`);--> statement-breakpoint
CREATE INDEX `local_context_event_route_touch_kind_time_idx` ON `local_context_event_route_touch` (`event_kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `local_context_event_physical_time_idx` ON `local_context_event` (`physical_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `local_context_event_route_time_idx` ON `local_context_event` (`route_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `local_route_lion_link_physical_id_idx` ON `local_route_lion_link` (`physical_id`);