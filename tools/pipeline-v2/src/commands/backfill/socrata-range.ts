/**
 * Backfill Socrata-backed corpus sources across a month range.
 *
 * For each (source, year, month) pair in the cross product, shells out to the
 * source's existing single-month v2 ingest command. Worker pool keeps --concurrency
 * tasks in flight at once.
 */
import { spawn } from "node:child_process";
import { arg, defineCommand, z } from "@liche/core";
import { fromRepoRoot } from "../../lib/paths.ts";

type Task = { source: string; year: number; month: number; label: string };
type Result = { source: string; label: string; status: "ok" | "error"; note?: string };

const ALLOWED_SOURCES = new Set([
  "nypd-collisions",
  "ace-violations",
  "dot-street-permits",
  "311-service-requests",
  "parking-violations",
  "dot-traffic-volumes",
]);

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function stepMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function parseMonthArg(value: string, label: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--${label} must be YYYY-MM, got: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
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
      tasks.push({
        source,
        year: cursor.year,
        month: cursor.month,
        label: isoMonth(cursor.year, cursor.month),
      });
    }
    cursor = stepMonth(cursor.year, cursor.month);
  }
  return tasks;
}

function runIngest(task: Task): Promise<Result> {
  return new Promise((resolve) => {
    const extraArgs: string[] = [];
    if (task.source === "dot-street-permits") extraArgs.push("--kind", "construction");
    if (task.source === "311-service-requests") extraArgs.push("--era", "current");
    const proc = spawn(
      "bun",
      [
        "--filter",
        "@bp/pipeline-v2",
        "cli",
        "--",
        "ingest",
        task.source,
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

export type BackfillSocrataRangeInputs = {
  sinceYear: number;
  sinceMonth: number;
  untilYear: number;
  untilMonth: number;
  sources?: string[] | undefined;
  concurrency?: number | undefined;
};

export async function runBackfillSocrataRange(inputs: BackfillSocrataRangeInputs): Promise<{
  taskCount: number;
  okCount: number;
  errorCount: number;
  results: Result[];
}> {
  const sources = inputs.sources ?? ["nypd-collisions", "ace-violations"];
  for (const s of sources) {
    if (!ALLOWED_SOURCES.has(s)) {
      throw new Error(`Unknown source: ${s}. Allowed: ${[...ALLOWED_SOURCES].join(",")}`);
    }
  }
  const concurrency = inputs.concurrency ?? 3;
  const tasks = enumerate(
    { year: inputs.sinceYear, month: inputs.sinceMonth },
    { year: inputs.untilYear, month: inputs.untilMonth },
    sources,
  );
  process.stdout.write(
    `backfill-socrata: ${tasks.length} tasks (${sources.length} sources × months), concurrency ${concurrency}\n`,
  );

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

export default defineCommand({
  path: ["backfill", "socrata-range"],
  summary: "Backfill Socrata corpus sources across (source × month) pairs in parallel.",
  input: {
    options: z.object({
      since: z.string().regex(/^\d{4}-\d{1,2}$/).describe("Start month, YYYY-MM"),
      until: z.string().regex(/^\d{4}-\d{1,2}$/).describe("End month, YYYY-MM"),
      sources: z
        .array(z.string())
        .default([])
        .describe("Source names (default: nypd-collisions, ace-violations)"),
      concurrency: arg.positiveInt().default(3).describe("Concurrent ingest workers"),
    }),
  },
  output: z.object({
    taskCount: z.number(),
    okCount: z.number(),
    errorCount: z.number(),
    results: z.array(z.unknown()),
  }),
  async run({ input }) {
    const since = parseMonthArg(input.options.since, "since");
    const until = parseMonthArg(input.options.until, "until");
    return runBackfillSocrataRange({
      sinceYear: since.year,
      sinceMonth: since.month,
      untilYear: until.year,
      untilMonth: until.month,
      sources: input.options.sources.length === 0 ? undefined : input.options.sources,
      concurrency: input.options.concurrency,
    });
  },
});
