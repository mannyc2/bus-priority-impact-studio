import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  Plan097ReaderDeployFailureReceiptSchema,
  type Plan097ReaderDeployReceipt,
  runPlan097ReaderDeployCheck,
} from "../src/lib/plan097-reader-deploy.ts";

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
  const baseUrl = required(args, "base-url");
  const expectedReleaseId = required(args, "expected-release");
  const repoSha = required(args, "repo-sha");
  const workflowRunId = required(args, "workflow-run-id");
  const expectedWorkerVersionId = required(args, "worker-version-id");
  const versionOverrideWorkerName = args.get("version-override-worker");
  const observations: Array<{
    path: string;
    status: number;
    requestId: string | null;
    cfRay: string | null;
    cacheControl: string | null;
    cfCacheStatus: string | null;
    age: string | null;
    workerVersionId: string | null;
  }> = [];
  const observingFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await fetch(input, init);
    const url = new URL(input instanceof Request ? input.url : input);
    observations.push({
      path: `${url.pathname}${url.search}`,
      status: response.status,
      requestId: response.headers.get("x-request-id"),
      cfRay: response.headers.get("cf-ray"),
      cacheControl: response.headers.get("cache-control"),
      cfCacheStatus: response.headers.get("cf-cache-status"),
      age: response.headers.get("age"),
      workerVersionId: response.headers.get("x-bp-worker-version"),
    });
    return response;
  };
  let receipt: Plan097ReaderDeployReceipt;
  try {
    receipt = await runPlan097ReaderDeployCheck(
      {
        baseUrl,
        expectedReleaseId,
        repoSha,
        workflowRunId,
        expectedWorkerVersionId,
        versionOverrideWorkerName,
      },
      { fetch: observingFetch },
    );
  } catch (error) {
    const failureReceipt = decodeStrict(Plan097ReaderDeployFailureReceiptSchema)({
      artifactKind: "bp.ops.plan097.reader-deploy-attempt.v1",
      schemaVersion: 1,
      repoSha,
      workflowRunId,
      workerVersionId: expectedWorkerVersionId,
      requestRouting: versionOverrideWorkerName === undefined ? "ordinary" : "version-override",
      expectedPreviousReleaseId: expectedReleaseId,
      failedAt: new Date().toISOString(),
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown reader-deploy failure",
      observations,
    });
    await writeAtomic(
      required(args, "failure-output"),
      `${JSON.stringify(failureReceipt, null, 2)}\n`,
    );
    throw error;
  }
  await writeAtomic(required(args, "output"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    JSON.stringify({
      artifactKind: receipt.artifactKind,
      repoSha: receipt.repoSha,
      workerVersionId: receipt.workerVersionId,
      requestRouting: receipt.requestRouting,
      activeReleaseId: receipt.baseline.activeReleaseId,
      endpointCount: receipt.baseline.endpoints.length,
      exactRouteCount: receipt.exactRouteCount,
    }),
  );
}

if (import.meta.main) await run(process.argv.slice(2));
