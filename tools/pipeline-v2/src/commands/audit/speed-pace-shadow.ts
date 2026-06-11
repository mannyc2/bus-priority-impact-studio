import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { speedPaceShadowAuditPath } from "@bp/applied-research/artifacts";
import { buildSpeedPaceRouteMonthShadowAudit } from "@bp/applied-research/evaluation";
import { loadSpeedPaceShadowAuditLocalDbRows } from "@bp/applied-research/local-db";
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

export { speedPaceShadowAuditPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["audit", "speed-pace-shadow"],
  summary:
    "Audit whether route-month clean no-hits hide segment/daypart speed pace hotspot candidates.",
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
    hiddenSegmentHitRouteCount: z.number().int().nonnegative(),
    hiddenSegmentCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? speedPaceShadowAuditPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      sqlite.exec("PRAGMA busy_timeout = 5000");
      const rows = loadSpeedPaceShadowAuditLocalDbRows({
        sqlite,
        month: releaseMonth,
      });
      const artifact = buildSpeedPaceRouteMonthShadowAudit({
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        cleanNoHitRows: rows.cleanNoHitRows,
        speedPaceCandidateRows: rows.speedPaceCandidateRows,
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        hiddenSegmentHitRouteCount: artifact.summary.hiddenSegmentHitRouteCount,
        hiddenSegmentCandidateCount: artifact.summary.hiddenSegmentCandidateCount,
      };
    } finally {
      sqlite.close();
    }
  },
});
