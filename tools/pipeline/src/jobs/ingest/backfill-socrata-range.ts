/**
 * Backfill Socrata-backed corpus sources across a month range.
 *
 * For each (source, year, month) pair in the cross product, shells out to the
 * source's existing single-month ingest command. Worker pool keeps --concurrency
 * tasks in flight at once.
 *
 * Each task is independent: different Socrata datasets, different SQLite tables.
 * Safe to run alongside the bus-observatory backfill — WAL handles writer
 * serialization at the SQLite level.
 */
import { spawn } from "node:child_process";
import { type CliOption, parseCliOptions } from "../../lib/cli-args.js";
import { fromRepoRoot } from "../../lib/paths.js";

type BackfillArgs = {
  sinceYear?: number;
  sinceMonth?: number;
  untilYear?: number;
  untilMonth?: number;
  sources?: string[];
  concurrency?: number;
};

type Task = { source: string; year: number; month: number; label: string };
type Result = { source: string; label: string; status: "ok" | "error"; note?: string };

const ALLOWED_SOURCES = new Set([
  "nypd-collisions",
  "ace-violations",
  "dot-street-permits",
  "311-service-requests",
]);

function parseMonth(value: string | undefined, label: string): { year: number; month: number } {
  if (value === undefined) throw new Error(`Missing required argument: --${label}`);
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--${label} must be YYYY-MM, got: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function stepMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function enumerate(
  since: { year: number; month: number },
  until: { year: number; month: number },
  sources: string[],
): Task[] {
  const tasks: Task[] = [];
  let cursor = since;
  while (cursor.year < until.year || (cursor.year === until.year && cursor.month <= until.month)) {
    for (const source of sources) {
      tasks.push({ source, year: cursor.year, month: cursor.month, label: isoMonth(cursor.year, cursor.month) });
    }
    cursor = stepMonth(cursor.year, cursor.month);
  }
  return tasks;
}

function runIngest(task: Task): Promise<Result> {
  return new Promise((resolve) => {
    const extraArgs: string[] = [];
    if (task.source === "dot-street-permits") {
      extraArgs.push("--kind", "construction");
    }
    if (task.source === "311-service-requests") {
      extraArgs.push("--era", "current");
    }
    const proc = spawn(
      "bun",
      [
        "--filter",
        "@bp/pipeline",
        `ingest:${task.source}`,
        "--",
        "--year",
        String(task.year),
        "--month",
        String(task.month),
        ...extraArgs,
      ],
      { cwd: fromRepoRoot("."), stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      resolve({ source: task.source, label: task.label, status: "error", note: err.message });
    });
    proc.on("close", (code) => {
      const tag = `${task.source} ${task.label}`;
      if (code === 0) {
        process.stdout.write(`backfill-socrata: ${tag} ok\n`);
        resolve({ source: task.source, label: task.label, status: "ok" });
      } else {
        process.stdout.write(`backfill-socrata: ${tag} ERROR (exit ${code})\n`);
        resolve({
          source: task.source,
          label: task.label,
          status: "error",
          note: stderr.slice(-1500),
        });
      }
    });
  });
}

function parseArgs(args: string[]): BackfillArgs {
  const output: BackfillArgs = {};
  const options: CliOption<BackfillArgs>[] = [
    {
      flags: ["--since"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "since");
        target.sinceYear = year;
        target.sinceMonth = month;
      },
    },
    {
      flags: ["--until"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "until");
        target.untilYear = year;
        target.untilMonth = month;
      },
    },
    {
      flags: ["--sources"],
      apply: (target, value) => {
        if (value === undefined) return;
        const parsed = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        for (const s of parsed) {
          if (!ALLOWED_SOURCES.has(s)) {
            throw new Error(`Unknown source: ${s}. Allowed: ${[...ALLOWED_SOURCES].join(",")}`);
          }
        }
        target.sources = parsed;
      },
    },
    {
      flags: ["--concurrency"],
      apply: (target, value) => {
        target.concurrency = Math.max(1, Number(value));
      },
    },
  ];
  return parseCliOptions(args, output, options);
}

export async function backfillSocrataRange(args: BackfillArgs): Promise<{
  taskCount: number;
  okCount: number;
  errorCount: number;
  results: Result[];
}> {
  if (args.sinceYear === undefined || args.sinceMonth === undefined) {
    throw new Error("Missing required argument: --since YYYY-MM");
  }
  if (args.untilYear === undefined || args.untilMonth === undefined) {
    throw new Error("Missing required argument: --until YYYY-MM");
  }
  const sources = args.sources ?? ["nypd-collisions", "ace-violations"];
  const concurrency = args.concurrency ?? 3;
  const tasks = enumerate(
    { year: args.sinceYear, month: args.sinceMonth },
    { year: args.untilYear, month: args.untilMonth },
    sources,
  );
  process.stdout.write(`backfill-socrata: ${tasks.length} tasks (${sources.length} sources × months), concurrency ${concurrency}\n`);

  const results: Result[] = [];
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i += 1) {
    workers.push(
      (async () => {
        while (cursor < tasks.length) {
          const idx = cursor;
          cursor += 1;
          const task = tasks[idx];
          if (task === undefined) break;
          results.push(await runIngest(task));
        }
      })(),
    );
  }
  await Promise.all(workers);
  const okCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  results.sort((a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label));
  return { taskCount: tasks.length, okCount, errorCount, results };
}

export async function backfillSocrataRangeFromCli(args: string[]): Promise<{
  taskCount: number;
  okCount: number;
  errorCount: number;
  results: Result[];
}> {
  return backfillSocrataRange(parseArgs(args));
}
