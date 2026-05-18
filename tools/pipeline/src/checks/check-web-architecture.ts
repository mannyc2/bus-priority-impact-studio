const appSourceRoot = "apps/web/src";

const forbiddenRuntimeImports = [
  "@bp/analytics",
  "@bp/sources",
  "@bp/pipeline",
  "tools/pipeline",
  "knowledge/",
];

type SourceFile = {
  path: string;
  text: string;
};

async function readSourceFiles(root: string): Promise<readonly SourceFile[]> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: SourceFile[] = [];

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const path = `${root}/${relativePath}`;
    files.push({ path, text: await Bun.file(path).text() });
  }

  return files.toSorted((left, right) => left.path.localeCompare(right.path));
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

function importsProductionFixture(specifier: string): boolean {
  return (
    specifier.includes("fixtures/demo-snippets") ||
    specifier.includes("studio/sample-data") ||
    specifier.endsWith("/sample-data.js") ||
    specifier === "../sample-data.js"
  );
}

function isPrivateStudioStorageKeyAllowed(file: SourceFile): boolean {
  return (
    file.path.includes("/worker/") ||
    file.path.endsWith("/studio/sample-data.ts") ||
    file.path.includes("/scripts/")
  );
}

function collectViolations(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const specifiers = extractModuleSpecifiers(file.text);

    for (const forbiddenImport of forbiddenRuntimeImports) {
      if (file.text.includes(forbiddenImport)) {
        violations.push(
          `${file.path}: public app code imports forbidden runtime dependency ${forbiddenImport}`,
        );
      }
    }

    const isUiFile = !file.path.includes("/worker/");
    if (isUiFile && /from ["'][^"']*\/worker\//.test(file.text)) {
      violations.push(`${file.path}: UI code must not import Worker runtime code`);
    }

    const isProductionRuntimeFile =
      !file.path.includes("/dev/") &&
      !file.path.includes("/fixtures/") &&
      !file.path.endsWith("/studio/sample-data.ts");

    if (isProductionRuntimeFile) {
      if (file.text.includes("X-Studio-Projection")) {
        violations.push(
          `${file.path}: public Studio API must not expose private R2 projection object keys`,
        );
      }

      if (!isPrivateStudioStorageKeyAllowed(file) && file.text.includes("studio/v1/")) {
        violations.push(
          `${file.path}: production runtime must use RESTful /api/v1/studio/* resources, not private studio/v1/* storage keys`,
        );
      }

      for (const specifier of specifiers) {
        if (importsProductionFixture(specifier)) {
          violations.push(
            `${file.path}: production runtime imports ${specifier}; use /api/v1/studio/* contracts or release artifacts instead`,
          );
        }
      }
    }
  }

  return violations;
}

const files = await readSourceFiles(appSourceRoot);
const violations = collectViolations(files);

if (violations.length > 0) {
  const message = ["web architecture check failed:", ...violations.map((item) => `- ${item}`)];
  console.error(message.join("\n"));
  process.exit(1);
}

console.log(`web architecture check passed (${files.length} files scanned)`);
