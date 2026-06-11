CREATE INDEX IF NOT EXISTS `local_route_hourly_ridership_month_route_idx` ON `local_route_hourly_ridership` (`month`,`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_route_intervention_comparison_month_route_idx` ON `local_route_intervention_comparison` (`month`,`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_route_month_trend_month_route_idx` ON `local_route_month_trend` (`month`,`route_id`);
