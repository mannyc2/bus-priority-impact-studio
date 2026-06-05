CREATE TABLE `identity` (
  `identity_id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `email_normalized` text NOT NULL,
  `display_name` text,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `identity_email_normalized_idx` ON `identity` (`email_normalized`);

CREATE TABLE `identity_session` (
  `session_id` text PRIMARY KEY NOT NULL,
  `identity_id` text NOT NULL,
  `kind` text NOT NULL,
  `token_hash` text NOT NULL,
  `label` text,
  `user_agent` text,
  `ip_hash` text,
  `expires_at` text,
  `consumed_at` text,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `last_used_at` text
);

CREATE UNIQUE INDEX `identity_session_token_hash_idx` ON `identity_session` (`token_hash`);
CREATE INDEX `identity_session_identity_kind_idx` ON `identity_session` (`identity_id`, `kind`);

CREATE TABLE `studio_actor_role` (
  `role_id` text PRIMARY KEY NOT NULL,
  `identity_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `scopes_json` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `studio_actor_role_identity_workspace_idx`
  ON `studio_actor_role` (`identity_id`, `workspace_id`);

INSERT INTO `identity` (
  `identity_id`, `email`, `email_normalized`, `display_name`,
  `active`, `created_at`, `updated_at`
)
SELECT
  `actor_id`, `email`, lower(trim(`email`)), `display_name`,
  `active`, `created_at`, `updated_at`
FROM `studio_actor`;

INSERT INTO `studio_actor_role` (
  `role_id`, `identity_id`, `workspace_id`, `scopes_json`,
  `active`, `created_at`, `updated_at`
)
SELECT
  'role_' || `actor_id`, `actor_id`, `workspace_id`, `scopes_json`,
  `active`, `created_at`, `updated_at`
FROM `studio_actor`;

INSERT INTO `identity_session` (
  `session_id`, `identity_id`, `kind`, `token_hash`, `label`,
  `expires_at`, `created_at`, `last_used_at`, `revoked_at`
)
SELECT
  `token_id`, `actor_id`, 'legacy_bearer', `token_hash`, `label`,
  NULL, `created_at`, `last_used_at`,
  CASE WHEN `active` = 1 THEN NULL ELSE `created_at` END
FROM `studio_actor_token`;
