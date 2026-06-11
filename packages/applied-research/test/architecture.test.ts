import { describe, expect, test } from "bun:test";

const forbiddenImports = [
  "apps/",
  "tools/",
  "knowledge/",
  "@bp/sources",
  "react",
  "@cloudflare",
  "wrangler",
];

async function readSourceFiles(): Promise<Array<{ path: string; text: string }>> {
  const glob = new Bun.Glob("**/*.ts");
  const files: Array<{ path: string; text: string }> = [];
  const srcRoot = new URL("../src/", import.meta.url);

  for await (const path of glob.scan({ cwd: srcRoot.pathname, onlyFiles: true })) {
    files.push({
      path: `src/${path}`,
      text: await Bun.file(new URL(path, srcRoot)).text(),
    });
  }

  return files;
}

function extractModuleSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

describe("applied research architecture", () => {
  test("keeps package free of apps, tools, source fetchers, and UI/runtime imports", async () => {
    const files = await readSourceFiles();

    for (const file of files) {
      for (const specifier of extractModuleSpecifiers(file.text)) {
        for (const forbiddenImport of forbiddenImports) {
          expect(
            specifier === forbiddenImport || specifier.startsWith(forbiddenImport),
            `${file.path} imports ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });

  test("root barrel stays explicit", async () => {
    const text = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
    expect(/export\s+\*\s+from/.test(text)).toBe(false);
  });
});
