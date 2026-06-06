ALTER TABLE `studio_brief_draft` ADD `owner_kind` text NOT NULL DEFAULT 'workspace';
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `owner_identity_id` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `guest_token_hash` text;
--> statement-breakpoint
ALTER TABLE `studio_brief_draft` ADD `guest_claimed_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_draft_owner_idx` ON `studio_brief_draft` (`owner_kind`,`owner_identity_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_brief_draft_guest_token_idx` ON `studio_brief_draft` (`guest_token_hash`);
