ALTER TABLE `local_finding_candidate` ADD `month` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `scope_kind` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `scope_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `category` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `confidence` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `detector_score` real NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `reason_code` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `claim_safe_label` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_candidate` ADD `review_state` text NOT NULL;--> statement-breakpoint
CREATE INDEX `local_finding_candidate_month_detector_route_idx` ON `local_finding_candidate` (`month`,`detector_id`,`route_id`);--> statement-breakpoint
ALTER TABLE `local_finding_coverage_audit` ADD `month` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_finding_coverage_audit` ADD `reason_code` text;--> statement-breakpoint
CREATE INDEX `local_finding_coverage_audit_run_detector_outcome_idx` ON `local_finding_coverage_audit` (`detector_run_id`,`detector_id`,`outcome`);--> statement-breakpoint
ALTER TABLE `local_finding_evidence_link` ADD `evidence_role` text NOT NULL;