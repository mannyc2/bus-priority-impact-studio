import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";
import type { SourceProbeOutput } from "./source-probes.js";
import { probeSource, writeProbeOutput } from "./source-probes.js";

const metadataDir = fromRepoRoot("knowledge/raw/metadata");
const manifest = await readSourceManifest();
const outputs: SourceProbeOutput[] = [];
const { MTA_BUS_TIME_API_KEY: rawBusTimeApiKey } = process.env;
const busTimeApiKey = rawBusTimeApiKey?.trim();
const probeOptions = busTimeApiKey === undefined || busTimeApiKey === "" ? {} : { busTimeApiKey };

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

if (blockedCount > 0) {
  process.exitCode = 1;
}
