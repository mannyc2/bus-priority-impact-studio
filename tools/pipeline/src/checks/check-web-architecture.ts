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

function collectViolations(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
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
