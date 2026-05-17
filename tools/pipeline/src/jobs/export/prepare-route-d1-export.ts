import { buildRouteBatchAudit } from "../build/route-batch-audit.js";

export type PrepareRouteD1ExportArgs = {
  year: number;
  month: number;
  dbPath: string;
  runAudit: boolean;
  artifactRoot?: string;
};

export async function prepareRouteD1Export(args: PrepareRouteD1ExportArgs): Promise<void> {
  if (!args.runAudit) {
    return;
  }

  await buildRouteBatchAudit({
    year: args.year,
    month: args.month,
    dbPath: args.dbPath,
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
  });
}
