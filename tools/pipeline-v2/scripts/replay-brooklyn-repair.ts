import { DocumentInterventionRecordsToolResponseSchema } from "@bp/domain";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INTERVENTION_RECORDS_TOOL_NAME,
  extractToolCallArguments,
  repairInterventionRecordsAliases,
  repairInvalidEnumValues,
} from "../src/commands/docs/tier2/_shared.ts";

const bucketsRoot =
  "/mnt/models/dev/bus-reliability-tracker/data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-v2-brooklyn-smoke-post-p16-2026-05-27/sources/0001_mta_brooklyn_bus_network_draft_plan_with_route_profiles_pdf/buckets";

const dirs = readdirSync(bucketsRoot);
let pass = 0;
let fail = 0;
const failures: Array<{ bucket: string; issues: unknown[] }> = [];
for (const dir of dirs) {
  const toolCallPath = join(bucketsRoot, dir, "intervention-records-tool-call.json");
  const responsePath = join(bucketsRoot, dir, "openrouter-response.json");
  let toolArgs: unknown;
  try {
    if (existsSync(toolCallPath)) {
      toolArgs = JSON.parse(readFileSync(toolCallPath, "utf8"));
    } else {
      const responseJson = JSON.parse(readFileSync(responsePath, "utf8"));
      toolArgs = extractToolCallArguments(responseJson, INTERVENTION_RECORDS_TOOL_NAME);
      if (toolArgs === null) {
        throw new Error("MISSING_TOOL_ARGS");
      }
    }
  } catch {
    fail += 1;
    failures.push({ bucket: dir, issues: ["MISSING_TOOL_CALL_FILE"] });
    continue;
  }
  const { patched: aliasOut } = repairInterventionRecordsAliases(toolArgs);
  const { patched: enumOut } = repairInvalidEnumValues(aliasOut, (v) =>
    DocumentInterventionRecordsToolResponseSchema.safeParse(v),
  );
  const parsed = DocumentInterventionRecordsToolResponseSchema.safeParse(enumOut);
  if (parsed.success) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({
      bucket: dir,
      issues: parsed.error.issues.slice(0, 4).map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
  }
}
console.log(`pass=${pass} fail=${fail}`);
for (const f of failures) {
  console.log("=== " + f.bucket);
  console.log(JSON.stringify(f.issues, null, 2));
}
