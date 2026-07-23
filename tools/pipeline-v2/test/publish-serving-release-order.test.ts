import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("publish serving release ordering", () => {
  test("runs completeness, ordinary D1, R2, then final catalog registration", async () => {
    const script = await readFile(
      join(import.meta.dir, "../../../scripts/publish-serving-release.sh"),
      "utf8",
    );
    const gate = script.indexOf("check-publish-completeness.ts");
    const schema = script.indexOf('--file "$schema_sql"');
    const seed = script.indexOf('--file "$seed_sql"');
    const r2 = script.indexOf("publish r2-artifacts");
    const registration = script.indexOf('--file "$map_release_registration_sql"');
    expect(gate).toBeGreaterThan(0);
    expect(schema).toBeGreaterThan(gate);
    expect(seed).toBeGreaterThan(schema);
    expect(r2).toBeGreaterThan(seed);
    expect(registration).toBeGreaterThan(r2);
    expect(script.indexOf("aborting before remote mutation")).toBeGreaterThan(gate);
    expect(
      script.indexOf('map_release_registration_sql="$export_dir/map-release-registration.sql"'),
    ).toBeGreaterThan(0);
  });

  test("refuses every legacy direct remote execution during Plan 097", async () => {
    const root = await mkdtemp(join(tmpdir(), "publish-serving-order-"));
    roots.push(root);
    const bin = join(root, "bin");
    const exportDir = join(root, "data", "exports", "d1", "2026-03");
    const logPath = join(root, "commands.log");
    await mkdir(bin, { recursive: true });
    await mkdir(exportDir, { recursive: true });
    for (const file of ["schema.sql", "seed.sql", "map-release-registration.sql"]) {
      await writeFile(join(exportDir, file), "SELECT 1;\n");
    }

    const bunPath = join(bin, "bun");
    await writeFile(
      bunPath,
      `#!/bin/sh
printf 'bun %s\\n' "$*" >> "$PUBLISH_TEST_LOG"
case "$*" in
  "run tools/pipeline-v2/src/checks/check-publish-completeness.ts --month 2026-03") exit 0 ;;
  "--filter @bp/pipeline-v2 cli -- publish r2-artifacts --month 2026-03 --bucket test-bucket") exit 42 ;;
  *) exit 0 ;;
esac
`,
    );
    const bunxPath = join(bin, "bunx");
    await writeFile(
      bunxPath,
      `#!/bin/sh
printf 'bunx %s\\n' "$*" >> "$PUBLISH_TEST_LOG"
exit 0
`,
    );
    await Promise.all([chmod(bunPath, 0o755), chmod(bunxPath, 0o755)]);

    const script = join(import.meta.dir, "../../../scripts/publish-serving-release.sh");
    const child = Bun.spawn(
      ["sh", script, "--month", "2026-03", "--d1", "test-db", "--r2", "test-bucket", "--execute"],
      {
        cwd: root,
        env: {
          ...processEnv(),
          // biome-ignore lint/complexity/useLiteralKeys: process.env is index-signature typed.
          PATH: `${bin}:${globalThis.process.env["PATH"] ?? ""}`,
          PUBLISH_TEST_LOG: logPath,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(2);
    expect(await new Response(child.stderr).text()).toContain(
      "Use the protected `publish recovery` Worker transport",
    );
    expect(await Bun.file(logPath).exists()).toBe(false);
  });
});

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
