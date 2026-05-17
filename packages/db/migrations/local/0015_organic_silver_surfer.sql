ALTER TABLE `local_route_intervention_comparison` ADD `comparison_route_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_route_ids` text;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_pre_average_speed_mph` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_post_average_speed_mph` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_speed_delta_mph` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `adjusted_speed_delta_mph` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_pre_average_monthly_ridership` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_post_average_monthly_ridership` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `comparison_ridership_delta` real;--> statement-breakpoint
ALTER TABLE `local_route_intervention_comparison` ADD `adjusted_ridership_delta` real;