import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeMonthShadowAuditPath } from "@bp/applied-research/artifacts";
import { buildRouteMonthShadowAudit } from "@bp/applied-research/evaluation";
import { loadRouteMonthShadowAuditLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { routeMonthShadowAuditPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["audit", "route-month-shadow"],
  summary:
    "Audit route-month clean no-hits against richer-grain detector candidates on the same routes.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    routeMonthCleanNoHitRouteCount: z.number().int().nonnegative(),
    hiddenRouteCount: z.number().int().nonnegative(),
    hiddenCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? routeMonthShadowAuditPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const rows = loadRouteMonthShadowAuditLocalDbRows({
        sqlite,
        month: releaseMonth,
      });
      const artifact = buildRouteMonthShadowAudit({
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        cleanNoHitRows: rows.cleanNoHitRows,
        richerCandidateRows: rows.richerCandidateRows,
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        routeMonthCleanNoHitRouteCount: artifact.summary.routeMonthCleanNoHitRouteCount,
        hiddenRouteCount: artifact.summary.hiddenRouteCount,
        hiddenCandidateCount: artifact.summary.hiddenCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});
