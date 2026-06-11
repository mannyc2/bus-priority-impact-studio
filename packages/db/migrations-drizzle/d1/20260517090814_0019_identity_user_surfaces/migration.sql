CREATE TABLE `alert` (
  `alert_id` text PRIMARY KEY NOT NULL,
  `identity_id` text NOT NULL,
  `kind` text NOT NULL,
  `payload_json` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `alert_identity_idx` ON `alert` (`identity_id`);

CREATE TABLE `saved_search` (
  `saved_search_id` text PRIMARY KEY NOT NULL,
  `identity_id` text NOT NULL,
  `label` text NOT NULL,
  `query_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `saved_search_identity_idx` ON `saved_search` (`identity_id`);

CREATE TABLE `public_comment` (
  `comment_id` text PRIMARY KEY NOT NULL,
  `brief_id` text NOT NULL,
  `identity_id` text NOT NULL,
  `body` text NOT NULL,
  `created_at` text NOT NULL,
  `deleted_at` text
);

CREATE INDEX `public_comment_brief_idx` ON `public_comment` (`brief_id`, `created_at`);
CREATE INDEX `public_comment_identity_idx` ON `public_comment` (`identity_id`);
