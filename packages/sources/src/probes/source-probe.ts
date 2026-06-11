import type { ManifestSource } from "../registry/manifest.js";
import type { ProbeOptions, SourceProbeOutput } from "./contracts.js";
import { probeHttpSource } from "./http-source-probe.js";
import { probeRealtimeSource } from "./realtime-probe.js";
import { probeSocrataSource } from "./socrata-probe.js";

export async function probeSource(
  source: ManifestSource,
  options: ProbeOptions = {},
): Promise<SourceProbeOutput> {
  if (source.type === "socrata_dataset") {
    return probeSocrataSource(source, options);
  }

  if (source.type === "gtfs_realtime_api") {
    return probeRealtimeSource(source, options);
  }

  return probeHttpSource(source, options);
}
