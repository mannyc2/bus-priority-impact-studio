import { describe, expect, test } from "bun:test";

const forbiddenRuntimeImports = [
  "@bp/analytics",
  "@bp/sources",
  "@bp/pipeline",
  "@bp/pipeline-v2",
  "@bp/db/local",
  "tools/pipeline",
  "tools/pipeline-v2",
  "knowledge/",
];

const requiredRootScripts = {
  pipeline: "bun --filter @bp/pipeline-v2 cli --",
  "check:knowledge": "bun run tools/pipeline-v2/src/checks/check-knowledge.ts",
  "check:web-architecture": "bun test tests/harness/production-boundaries.test.ts --timeout 5000",
  "check:publish-completeness":
    "bun run tools/pipeline-v2/src/checks/check-publish-completeness.ts",
} as const;

async function readFiles(root: string): Promise<Array<{ path: string; text: string }>> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: Array<{ path: string; text: string }> = [];

  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    files.push({ path: `${root}/${path}`, text: await Bun.file(`${root}/${path}`).text() });
  }

  return files;
}

function extractModuleSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const moduleSpecifierPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of text.matchAll(moduleSpecifierPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function importsForbiddenSpecifier(text: string, forbiddenSpecifier: string): boolean {
  return extractModuleSpecifiers(text).some((specifier) => {
    if (forbiddenSpecifier.endsWith("/") || forbiddenSpecifier.endsWith(":")) {
      return specifier.startsWith(forbiddenSpecifier);
    }

    return specifier === forbiddenSpecifier || specifier.startsWith(`${forbiddenSpecifier}/`);
  });
}

function importsProductionFixture(text: string): string | null {
  return (
    extractModuleSpecifiers(text).find(
      (specifier) =>
        specifier.includes("fixtures/demo-snippets") ||
        specifier.includes("studio/sample-data") ||
        specifier.endsWith("/sample-data.js") ||
        specifier === "../sample-data.js",
    ) ?? null
  );
}

function isPrivateStudioStorageKeyAllowed(path: string): boolean {
  return (
    path.includes("/worker/") ||
    path.endsWith("/studio/sample-data.ts") ||
    path.includes("/scripts/")
  );
}

function hasWildcardReExport(text: string): boolean {
  return /export\s+\*\s+(?:as\s+\w+\s+)?from\s+["'][^"']+["']/.test(text);
}

async function findSrcTestFiles(): Promise<string[]> {
  const testFileGlob = new Bun.Glob("**/*.{test,spec}.ts");
  const roots = ["apps", "packages", "tools"];
  const testFiles: string[] = [];

  for (const root of roots) {
    for await (const path of testFileGlob.scan({ cwd: root, onlyFiles: true })) {
      if (path.includes("/src/")) {
        testFiles.push(`${root}/${path}`);
      }
    }
  }

  return testFiles;
}

describe("production boundary harness", () => {
  test("root package exposes v2 pipeline entrypoints and no stale v1 script paths", async () => {
    const rootPackage = (await Bun.file("package.json").json()) as {
      scripts?: Record<string, string>;
    };
    const pipelinePackage = (await Bun.file("tools/pipeline-v2/package.json").json()) as {
      name?: string;
      scripts?: Record<string, string>;
    };

    expect(pipelinePackage.name).toBe("@bp/pipeline-v2");
    expect(pipelinePackage.scripts?.["cli"]).toBe("bun run src/cli.ts");

    for (const [script, command] of Object.entries(requiredRootScripts)) {
      expect(rootPackage.scripts?.[script], `root package ${script} drifted`).toBe(command);
    }

    for (const [script, command] of Object.entries(rootPackage.scripts ?? {})) {
      expect(
        /tools\/pipeline(?!-v2)\//.test(command),
        `root package ${script} still references deleted tools/pipeline`,
      ).toBe(false);
      expect(
        /@bp\/pipeline(?!-v2)\b/.test(command),
        `root package ${script} still references @bp/pipeline`,
      ).toBe(false);
    }
  });

  test("public app code does not import local analytics, source fetchers, pipeline code, or wiki files", async () => {
    const files = await readFiles("apps/web/src");

    for (const file of files) {
      for (const forbiddenImport of forbiddenRuntimeImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("production runtime does not import Studio seed data or dev demo fixtures", async () => {
    const files = (await readFiles("apps/web/src")).filter(
      (file) =>
        !file.path.includes("/dev/") &&
        !file.path.includes("/fixtures/") &&
        !file.path.endsWith("/studio/sample-data.ts"),
    );

    for (const file of files) {
      expect(
        importsProductionFixture(file.text),
        `${file.path} must use /api/v1/studio/* contracts or release artifacts instead of production fixture imports`,
      ).toBeNull();
    }
  });

  test("public Studio runtime keeps R2 projection keys private behind REST resources", async () => {
    const files = (await readFiles("apps/web/src")).filter(
      (file) =>
        !file.path.includes("/dev/") &&
        !file.path.includes("/fixtures/") &&
        !file.path.endsWith("/studio/sample-data.ts"),
    );

    for (const file of files) {
      expect(
        file.text.includes("X-Studio-Projection"),
        `${file.path} must expose RESTful resources, not private R2 projection paths`,
      ).toBe(false);

      if (!isPrivateStudioStorageKeyAllowed(file.path)) {
        // Match `studio/v1/` only as an R2 key — not as part of a URL host
        // like `api.bpi.studio/v1/...`. R2 keys appear as plain identifiers,
        // never preceded by `.` (which would indicate the `.studio` TLD).
        const matches = file.text.match(/(^|[^.])studio\/v1\//);
        expect(
          matches !== null,
          `${file.path} must call /api/v1/studio/* instead of private studio/v1/* storage keys`,
        ).toBe(false);
      }
    }
  });

  test("domain package remains infrastructure-free", async () => {
    const files = await readFiles("packages/domain/src");
    const forbiddenImports = [
      "cloudflare",
      "@bp/db",
      "@bp/sources",
      "@bp/analytics",
      "react",
      "fs",
      "node:",
    ];

    for (const file of files) {
      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("applied research package stays headless and does not import apps, tools, wiki, source fetchers, or UI runtimes", async () => {
    const files = await readFiles("packages/applied-research/src");
    const forbiddenImports = [
      "apps/",
      "tools/",
      "knowledge/",
      "@bp/sources",
      "@bp/pipeline",
      "@bp/pipeline-v2",
      "react",
      "@cloudflare",
      "wrangler",
    ];

    for (const file of files) {
      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("package root barrels use explicit re-exports", async () => {
    const glob = new Bun.Glob("packages/*/src/index.ts");

    for await (const path of glob.scan({ onlyFiles: true })) {
      const text = await Bun.file(path).text();

      expect(hasWildcardReExport(text), `${path} uses a wildcard barrel export`).toBe(false);
    }
  });

  test("tests stay out of production src trees", async () => {
    expect(await findSrcTestFiles()).toEqual([]);
  });
});
