import type { ManifestSource } from "../registry/manifest.js";
import {
  createBaseProbe,
  errorMessage,
  type HttpProbe,
  type ProbeOptions,
  type SourceProbeOutput,
} from "./contracts.js";
import { fetchHttpMetadata } from "./transports/fetch.js";

function withHttpProbe(
  source: ManifestSource & { url: string },
  options: ProbeOptions,
  http: HttpProbe,
): SourceProbeOutput {
  return {
    ...createBaseProbe(source, options, http.ok ? "active" : "blocked"),
    url: source.url,
    http,
  };
}

export async function probeHttpSource(
  source: ManifestSource,
  options: ProbeOptions,
): Promise<SourceProbeOutput> {
  if (!("url" in source)) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      error: "Source does not include a URL.",
    };
  }

  try {
    return withHttpProbe(
      source,
      options,
      await fetchHttpMetadata(source.url, options.fetcher ?? fetch, options.headFallback),
    );
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      url: source.url,
      error: errorMessage(error),
    };
  }
}
