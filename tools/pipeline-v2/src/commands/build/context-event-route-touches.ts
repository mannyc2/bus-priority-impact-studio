import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { contextEventRouteTouchAuditPath } from "@bp/analytics/artifacts";
import {
  type SourceEventKindAudit as AppliedSourceEventKindAudit,
  auditContextEventRouteTouches,
  materializeContextEventRouteTouches,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type { SourceEventKindAudit } from "@bp/pipeline-v2/local-db-aggregates";

export type BuildContextEventRouteTouchesResult = {
  directTouches: number;
  routeLionTouches: number;
  parkingLocationTouches: number;
  total: number;
  computedAt: string;
  auditArtifactPath: string;
  sourceEventKinds: AppliedSourceEventKindAudit[];
};

export { contextEventRouteTouchAuditPath } from "@bp/analytics/artifacts";

export type BuildContextEventRouteTouchesInputs = {
  local: OpenLocalPipelineDb;
  computedAt?: Date | undefined;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  auditOnly?: boolean | undefined;
};

export async function runBuildContextEventRouteTouches(
  inputs: BuildContextEventRouteTouchesInputs,
): Promise<BuildContextEventRouteTouchesResult> {
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const auditArtifactPath = inputs.output ?? contextEventRouteTouchAuditPath(artifactRoot);
  const { local } = inputs;
  const computedAt = (inputs.computedAt ?? new Date()).toISOString();

  if (inputs.auditOnly !== true) {
    materializeContextEventRouteTouches({ sqlite: local.sqlite, computedAt });
  }

  const audit = auditContextEventRouteTouches(local.sqlite);

  const result: BuildContextEventRouteTouchesResult = {
    directTouches: audit.directTouches,
    routeLionTouches: audit.routeLionTouches,
    parkingLocationTouches: audit.parkingLocationTouches,
    total: audit.total,
    computedAt,
    auditArtifactPath,
    sourceEventKinds: audit.sourceEventKinds,
  };

  await mkdir(dirname(auditArtifactPath), { recursive: true });
  await writeJson(auditArtifactPath, {
    artifactKind: "context_event_route_touch_audit",
    schemaVersion: 1,
    generatedAt: result.computedAt,
    summary: {
      directTouches: result.directTouches,
      routeLionTouches: result.routeLionTouches,
      parkingLocationTouches: result.parkingLocationTouches,
      totalTouches: result.total,
      sourceEventKindCount: result.sourceEventKinds.length,
    },
    sourceEventKinds: result.sourceEventKinds,
  });

  return result;
}

export default defineCommand({
  path: ["build", "context-event-route-touches"],
  summary: "Materialize event→route touches via direct, LION-buffer, and parking-match paths.",
  input: {
    options: dbOptions.extend({
      artifactRoot: z.string().optional().describe("Artifact root (defaults to data/artifacts/)"),
      output: z.string().optional().describe("Override path for the audit JSON"),
      auditOnly: arg
        .boolean()
        .default(false)
        .describe("Skip materializing the touches table; just rebuild the audit"),
    }),
  },
  output: z.object({
    directTouches: z.number(),
    routeLionTouches: z.number(),
    parkingLocationTouches: z.number(),
    total: z.number(),
    computedAt: z.string(),
    auditArtifactPath: z.string(),
    sourceEventKinds: z.array(z.unknown()),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "build.context-event-route-touches",
      operation: "runBuildContextEventRouteTouches",
      spanAttributes: {
        auditOnly: input.options.auditOnly,
      },
      run: (local) =>
        runBuildContextEventRouteTouches({
          local,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
          auditOnly: input.options.auditOnly,
        }),
    });
  },
});
