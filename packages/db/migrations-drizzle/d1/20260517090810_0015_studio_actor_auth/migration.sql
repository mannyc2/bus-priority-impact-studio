CREATE TABLE `studio_actor` (
  `actor_id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `workspace_id` text NOT NULL,
  `scopes_json` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `studio_actor_token` (
  `token_id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `label` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `last_used_at` text
);

CREATE INDEX `studio_actor_token_hash_idx` ON `studio_actor_token` (`token_hash`);
