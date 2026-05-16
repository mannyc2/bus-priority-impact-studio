import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { exportD1Seed } from "./export-d1.js";
import {
  collectD1TableCounts,
  loadD1Database,
  type RepositoryCheckResult,
  runD1RepositoryChecks,
  verifyD1RepositoryChecks,
  verifyD1TableCounts,
} from "./verify-d1-loaded-db.js";

type D1VerifyArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type D1VerifyResult = {
  isoMonth: string;
  status: "pass" | "fail";
  issueCount: number;
  tableCounts: Record<string, number>;
  repositoryChecks: RepositoryCheckResult;
};

function parseBuildArgs(args: D1VerifyArgs = {}) {
  return createMonthContext(args);
}

function parseCliArgs(args: string[]): D1VerifyArgs {
  return parseMonthDbCliArgs(args, {} as D1VerifyArgs);
}

export async function verifyD1Export(args: D1VerifyArgs = {}): Promise<D1VerifyResult> {
  const options = parseBuildArgs(args);
  const month = options.isoMonth;
  const exportResult = await exportD1Seed({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  const schemaSql = await Bun.file(exportResult.schemaPath).text();
  const seedSql = await Bun.file(exportResult.seedPath).text();
  const issues: string[] = [];
  const { database, db } = loadD1Database(schemaSql, seedSql);
  const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
  verifyD1TableCounts({
    issues,
    tableCounts,
    exportResult,
  });
  const checks = await runD1RepositoryChecks({
    db,
    month,
  });
  verifyD1RepositoryChecks({
    issues,
    checks,
    exportResult,
    publicTableCounts,
  });
  database.close();

  if (issues.length > 0) {
    throw new Error(`D1 export verification failed: ${issues.join(", ")}`);
  }

  return {
    isoMonth: month,
    status: "pass",
    issueCount: 0,
    tableCounts,
    repositoryChecks: checks,
  };
}

export async function verifyD1ExportFromCli(args: string[]): Promise<D1VerifyResult> {
  return verifyD1Export(parseCliArgs(args));
}
