CREATE INDEX `local_corridor_month_summary_month_idx` ON `local_corridor_month_summary` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_brief_summary_month_idx` ON `local_route_brief_summary` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_build_plan_month_idx` ON `local_route_build_plan` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_equity_context_month_idx` ON `local_route_equity_context` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_month_coverage_month_idx` ON `local_route_month_coverage` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_month_source_status_month_scope_idx` ON `local_route_month_source_status` (`month`,`source_scope`);--> statement-breakpoint
CREATE INDEX `local_route_observed_reliability_summary_month_idx` ON `local_route_observed_reliability_summary` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_readiness_month_idx` ON `local_route_readiness` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_reliability_baseline_month_idx` ON `local_route_reliability_baseline` (`month`);--> statement-breakpoint
CREATE INDEX `local_route_scorecard_month_idx` ON `local_route_scorecard` (`month`);