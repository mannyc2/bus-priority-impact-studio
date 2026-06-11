import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { contextEventRouteTouchAuditPath } from "@bp/applied-research/artifacts";
import {
  type SourceEventKindAudit as AppliedSourceEventKindAudit,
  auditContextEventRouteTouches,
  materializeContextEventRouteTouches,
} from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type { SourceEventKindAudit } from "@bp/applied-research/local-db";

export type BuildContextEventRouteTouchesResult = {
  directTouches: number;
  routeLionTouches: number;
  parkingLocationTouches: number;
  total: number;
  computedAt: string;
  auditArtifactPath: string;
  sourceEventKinds: AppliedSourceEventKindAudit[];
};

export { contextEventRouteTouchAuditPath } from "@bp/applied-research/artifacts";

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
  middleware: [withLocalDb()],
  output: z.object({
    directTouches: z.number(),
    routeLionTouches: z.number(),
    parkingLocationTouches: z.number(),
    total: z.number(),
    computedAt: z.string(),
    auditArtifactPath: z.string(),
    sourceEventKinds: z.array(z.unknown()),
  }),
  async run({ ctx, input }) {
    return runBuildContextEventRouteTouches({
      local: localDbFromCtx(ctx),
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      auditOnly: input.options.auditOnly,
    });
  },
});
