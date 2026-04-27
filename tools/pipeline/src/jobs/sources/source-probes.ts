import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SourceProbeOutput } from "@bp/sources/probes";
import { summarizeProbeOutputs } from "@bp/sources/probes";
import { writeJson } from "../../lib/json.js";

export type { SourceProbeOutput } from "@bp/sources/probes";
export {
  parseCurlHeadOutput,
  probeSocrataSource,
  probeSource,
  summarizeProbeOutputs,
} from "@bp/sources/probes";

function metadataFilename(id: string): string {
  if (!/^[a-z0-9_.-]+$/i.test(id)) {
    throw new Error(`Unsafe metadata filename id: ${id}`);
  }

  return `${id}.json`;
}

export async function writeProbeOutput(
  output: SourceProbeOutput,
  metadataDir = "knowledge/raw/metadata",
): Promise<void> {
  await mkdir(metadataDir, { recursive: true });
  await writeJson(join(metadataDir, metadataFilename(output.sourceId)), output);

  if (output.socrata !== undefined && output.socrataDataset !== undefined) {
    await writeJson(join(metadataDir, metadataFilename(output.socrata.datasetId)), {
      schemaVersion: output.schemaVersion,
      sourceId: output.sourceId,
      checkedAt: output.checkedAt,
      metadataUrl: output.socrata.metadataUrl,
      metadata: output.socrataDataset.metadata,
    });
    await writeJson(join(metadataDir, metadataFilename(`${output.socrata.datasetId}_columns`)), {
      schemaVersion: output.schemaVersion,
      sourceId: output.sourceId,
      checkedAt: output.checkedAt,
      columnsUrl: output.socrata.columnsUrl,
      columns: output.socrataDataset.columns,
    });
  }
}

export async function writeProbeSummary(
  outputs: SourceProbeOutput[],
  metadataDir = "knowledge/raw/metadata",
): Promise<void> {
  await mkdir(metadataDir, { recursive: true });
  await writeJson(join(metadataDir, "probe-summary.json"), summarizeProbeOutputs(outputs));
}
