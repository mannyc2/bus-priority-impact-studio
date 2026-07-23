import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runPlan097ReaderDeployCheck } from "../src/lib/plan097-reader-deploy.ts";

type Arguments = ReadonlyMap<string, string>;

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || value === undefined || !flag.startsWith("--")) {
      throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
    }
    values.set(flag.slice(2), value);
  }
  return values;
}

function required(args: Arguments, name: string): string {
  const value = args.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await Bun.write(temporary, text);
  await rename(temporary, output);
}

export async function run(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const receipt = await runPlan097ReaderDeployCheck({
    baseUrl: required(args, "base-url"),
    expectedReleaseId: required(args, "expected-release"),
    repoSha: required(args, "repo-sha"),
    workflowRunId: required(args, "workflow-run-id"),
  });
  await writeAtomic(required(args, "output"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    JSON.stringify({
      artifactKind: receipt.artifactKind,
      repoSha: receipt.repoSha,
      activeReleaseId: receipt.baseline.activeReleaseId,
      endpointCount: receipt.baseline.endpoints.length,
      exactRouteCount: receipt.exactRouteCount,
    }),
  );
}

if (import.meta.main) await run(process.argv.slice(2));
