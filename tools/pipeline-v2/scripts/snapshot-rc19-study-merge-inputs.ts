import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Map<string, string>();
for (let index = 2; index < Bun.argv.length; index += 2) {
  const flag = Bun.argv[index];
  const value = Bun.argv[index + 1];
  if (!flag?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
  }
  args.set(flag.slice(2), value);
}

const required = (name: string): string => {
  const value = args.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
};

const dbPath = required("db");
const outputPath = required("output");
const sqlite = new Database(dbPath, { readonly: true });

try {
  const registryRows = sqlite
    .query<
      {
        event_id: string;
        route_id: string;
        intervention_type: string;
        source_id: string;
        program: string;
        implementation_date: string | null;
        implementation_month: string;
        event_status: string;
        description: string;
      },
      []
    >(`
      SELECT
        event_id,
        route_id,
        intervention_type,
        source_id,
        program,
        implementation_date,
        implementation_month,
        event_status,
        description
      FROM local_intervention_event
      ORDER BY route_id, implementation_month, event_id
    `)
    .all();
  const availableAnalysisRouteIds = sqlite
    .query<{ route_id: string }, []>(`
      SELECT DISTINCT route_id
      FROM local_route_segment_speed
      ORDER BY route_id
    `)
    .all()
    .map((row) => row.route_id.trim().toUpperCase());

  const artifact = {
    artifactKind: "bp.studio.rc19_study_merge_logical_inputs.v1",
    schemaVersion: 1,
    summary: {
      registryRowCount: registryRows.length,
      availableAnalysisRouteIdCount: availableAnalysisRouteIds.length,
    },
    registryRows,
    availableAnalysisRouteIds,
  };
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bytes);
  console.log(
    JSON.stringify(
      {
        outputPath,
        ...artifact.summary,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      null,
      2,
    ),
  );
} finally {
  sqlite.close();
}
