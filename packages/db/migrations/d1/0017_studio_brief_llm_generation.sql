ALTER TABLE `studio_brief_draft` ADD `job_generation_mode` text NOT NULL DEFAULT 'deterministic_seed';

ALTER TABLE `studio_brief_draft` ADD `job_llm_status` text NOT NULL DEFAULT 'not_configured';

ALTER TABLE `studio_brief_draft` ADD `job_llm_provider` text;

ALTER TABLE `studio_brief_draft` ADD `job_llm_model` text;
