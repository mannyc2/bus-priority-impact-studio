import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { probeSource, type SourceProbeOutput } from "@bp/sources/probes";
import { fetchCurlHeadMetadata } from "@bp/sources/probes/transports/bun-curl";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";

function metadataFilename(id: string): string {
  if (!/^[a-z0-9_.-]+$/i.test(id)) {
    throw new Error(`Unsafe metadata filename id: ${id}`);
  }
  return `${id}.json`;
}

export async function writeProbeOutput(
  output: SourceProbeOutput,
  metadataDir: string,
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

export default defineCommand({
  path: ["sources", "probe"],
  summary: "Probe all manifest sources and write metadata snapshots.",
  input: { options: z.object({}) },
  output: z.object({
    sourceCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    metadataDir: z.string(),
  }),
  async run() {
    const metadataDir = fromRepoRoot("knowledge/raw/metadata");
    const manifestText = await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text();
    const manifest = loadSourceManifestYaml(manifestText);

    const mtaBusTimeApiKeyEnv = "MTA_BUS_TIME_API_KEY";
    const busTimeApiKey = process.env[mtaBusTimeApiKeyEnv]?.trim();
    const probeOptions =
      busTimeApiKey === undefined || busTimeApiKey === ""
        ? { headFallback: fetchCurlHeadMetadata }
        : { busTimeApiKey, headFallback: fetchCurlHeadMetadata };

    const outputs: SourceProbeOutput[] = [];
    for (const source of manifest.sources) {
      const output = await probeSource(source, probeOptions);
      await writeProbeOutput(output, metadataDir);
      outputs.push(output);
      const error = output.error === undefined ? "" : ` (${output.error})`;
      console.log(`${output.sourceId}: ${output.probeStatus}${error}`);
    }

    const blockedCount = outputs.filter((output) => output.probeStatus === "blocked").length;
    const skippedCount = outputs.filter((output) => output.probeStatus === "skipped").length;
    console.log(
      `Wrote ${outputs.length} source probe outputs to ${metadataDir} (${blockedCount} blocked, ${skippedCount} skipped).`,
    );

    return {
      sourceCount: outputs.length,
      blockedCount,
      skippedCount,
      metadataDir,
    };
  },
});
