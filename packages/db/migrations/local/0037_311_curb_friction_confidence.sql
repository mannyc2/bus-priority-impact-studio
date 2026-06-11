ALTER TABLE `local_311_service_request` ADD `curb_friction_category` text;--> statement-breakpoint
ALTER TABLE `local_311_service_request` ADD `curb_friction_rule` text;--> statement-breakpoint
ALTER TABLE `local_context_event_route_touch` ADD `segment_borough` text;--> statement-breakpoint
ALTER TABLE `local_context_event_route_touch` ADD `route_length_meters` real;--> statement-breakpoint
ALTER TABLE `local_context_event_route_touch` ADD `route_overlap_share` real;--> statement-breakpoint
ALTER TABLE `local_context_event_route_touch` ADD `join_confidence` text;--> statement-breakpoint
ALTER TABLE `local_context_event_route_touch` ADD `join_confidence_reason` text;
