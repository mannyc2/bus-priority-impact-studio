import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = fileURLToPath(
        new URL("../../packages/db/migrations/d1", import.meta.url),
      );
      const migrations = await readD1Migrations(migrationsPath);
      const servingMigrationsPath = fileURLToPath(
        new URL("../../packages/db/migrations/d1-v2/active", import.meta.url),
      );
      const servingMigrations = await Promise.all(
        (await readdir(servingMigrationsPath))
          .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
          .sort()
          .map(async (file) => ({
            name: `serving-${file}`,
            queries: [await readFile(join(servingMigrationsPath, file), "utf8")],
          })),
      );

      return {
        wrangler: {
          configPath: "./wrangler.test.jsonc",
        },
        miniflare: {
          bindings: {
            TEST_D1_MIGRATIONS: [...migrations, ...servingMigrations],
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.worker.test.ts"],
    setupFiles: ["./test/worker/apply-d1-migrations.ts"],
  },
});
