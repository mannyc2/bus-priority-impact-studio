/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { beforeAll } from "vitest";

type MigrationEnv = {
  DB?: D1Database;
  TEST_D1_MIGRATIONS?: D1Migration[];
};

beforeAll(async () => {
  const testEnv = env as unknown as MigrationEnv;
  if (testEnv.DB === undefined || testEnv.TEST_D1_MIGRATIONS === undefined) {
    return;
  }

  await applyD1Migrations(testEnv.DB, testEnv.TEST_D1_MIGRATIONS);
});
