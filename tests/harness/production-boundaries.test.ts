import { describe, expect, test } from "bun:test";

const forbiddenRuntimeImports = [
  "@bp/analytics",
  "@bp/sources",
  "@bp/pipeline",
  "tools/pipeline",
  "knowledge/",
];

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
