import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { prepareRouteD1Export } from "./prepare-route-d1-export.js";
import { type D1SeedOutputResult, writeRouteD1SeedOutput } from "./route-d1-seed-output.js";

type D1ExportArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  runAudit?: boolean;
};

type D1ExportResult = D1SeedOutputResult;

function parseBuildArgs(args: D1ExportArgs = {}) {
  return {
    ...createMonthContext(args),
    runAudit: args.runAudit ?? true,
  };
}

function parseCliArgs(args: string[]): D1ExportArgs {
  return parseMonthDbCliArgs(args, {} as D1ExportArgs);
}

export async function exportD1Seed(args: D1ExportArgs = {}): Promise<D1ExportResult> {
  const options = parseBuildArgs(args);
  await prepareRouteD1Export(options);
  return writeRouteD1SeedOutput({
    dbPath: options.dbPath,
    isoMonth: options.isoMonth,
  });
}

export async function exportD1SeedFromCli(args: string[]): Promise<D1ExportResult> {
  return exportD1Seed(parseCliArgs(args));
}
