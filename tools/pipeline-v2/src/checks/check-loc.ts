import { mkdirSync } from "node:fs";

// Repo-wide LOC report. Counts tracked source/test lines, grouped by area,
// and writes a snapshot artifact so runs are comparable over time. Report-only:
// it always exits 0. Mirrors the artifact pattern in check-web-performance.ts.

const auditDir = process.env["BP_LOC_AUDIT_DIR"] ?? "data/artifacts/loc";

// Excludes match the manual `git ls-files | wc -l` accounting: docs, data,
// design handoffs, vendored code, and generated DB migrations are not "code".
const EXCLUDED_DIR = /(^|\/)(node_modules|knowledge|docs|data|\.design-handoff)\//;
const EXCLUDED_MIGRATIONS = /migrations(-drizzle)?\//;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js)$/;
const CODE_FILE = /\.(ts|tsx|js|jsx|css)$/;

type AreaSummary = { area: string; sourceLines: number; testLines: number; files: number };

const tracked = (await runGit(["ls-files"])).split("\n").filter((line) => line.length > 0);

const areas = new Map<string, AreaSummary>();
let totalSource = 0;
let totalTest = 0;
let sourceFiles = 0;
let testFiles = 0;

for (const path of tracked) {
  if (EXCLUDED_DIR.test(path)) continue;
  if (EXCLUDED_MIGRATIONS.test(path)) continue;
  if (!CODE_FILE.test(path)) continue;

  // git ls-files can list tracked-but-deleted paths; skip what is not on disk.
  const file = Bun.file(path);
  if (!(await file.exists())) continue;

  const lines = countLines(await file.text());
  const isTest = TEST_FILE.test(path);
  const area = areaFor(path);
  const summary = areas.get(area) ?? { area, sourceLines: 0, testLines: 0, files: 0 };

  if (isTest) {
    summary.testLines += lines;
    totalTest += lines;
    testFiles += 1;
  } else {
    summary.sourceLines += lines;
    totalSource += lines;
    sourceFiles += 1;
  }
  summary.files += 1;
  areas.set(area, summary);
}

const ranked = [...areas.values()].toSorted((left, right) => right.sourceLines - left.sourceLines);

const generatedAt = new Date().toISOString();
const snapshot = {
  schemaVersion: 1,
  generatedAt,
  totals: {
    sourceLines: totalSource,
    testLines: totalTest,
    sourceFiles,
    testFiles,
  },
  areas: ranked,
};

mkdirSync(auditDir, { recursive: true });
await Bun.write(`${auditDir}/latest.json`, `${JSON.stringify(snapshot, null, 2)}\n`);

const pad = (value: string, width: number): string => value.padStart(width);
console.log("LOC report (tracked source/test, excludes docs/data/generated)\n");
console.log(`${"source".padStart(10)}  ${"test".padStart(9)}  area`);
for (const summary of ranked) {
  console.log(
    `${pad(summary.sourceLines.toLocaleString(), 10)}  ${pad(summary.testLines.toLocaleString(), 9)}  ${summary.area}`,
  );
}
console.log(
  `\n${pad(totalSource.toLocaleString(), 10)}  ${pad(totalTest.toLocaleString(), 9)}  TOTAL` +
    ` (${sourceFiles} source files, ${testFiles} test files)`,
);
console.log(`\nsnapshot: ${auditDir}/latest.json`);

function areaFor(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "packages" || parts[0] === "apps" || parts[0] === "tools") {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? path;
}

function countLines(text: string): number {
  // Match `wc -l`: count newline characters.
  let count = 0;
  for (const char of text) {
    if (char === "\n") count += 1;
  }
  return count;
}

async function runGit(args: readonly string[]): Promise<string> {
  const proc = Bun.spawn({ cmd: ["git", ...args], stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout;
}
