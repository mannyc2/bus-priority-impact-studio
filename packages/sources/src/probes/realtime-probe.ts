import type { ManifestSource } from "../registry/manifest.js";
import {
  createBaseProbe,
  errorMessage,
  type HttpProbe,
  type ProbeOptions,
  type SourceProbeOutput,
} from "./contracts.js";
import { buildRealtimeUrl, redactBusTimeUrl, redactSecret } from "./redact.js";
import { fetchRealtimeMetadata } from "./transports/fetch.js";

export async function probeRealtimeSource(
  source: ManifestSource,
  options: ProbeOptions,
): Promise<SourceProbeOutput> {
  if (!("url" in source)) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      error: "Realtime source does not include a URL template.",
    };
  }

  const apiKey = options.busTimeApiKey?.trim();
  if (!apiKey) {
    return {
      ...createBaseProbe(source, options, "skipped"),
      redactedUrl: source.url.replace("<YOUR_KEY>", "<redacted>"),
      error: "Set MTA_BUS_TIME_API_KEY to probe Bus Time GTFS-RT feeds.",
    };
  }

  const url = buildRealtimeUrl(source.url, apiKey);
  try {
    const http = await fetchRealtimeMetadata(url, options.fetcher ?? fetch);
    const redactedHttp: HttpProbe = {
      ...http,
      finalUrl: redactBusTimeUrl(http.finalUrl, apiKey),
    };

    const output: SourceProbeOutput = {
      ...createBaseProbe(source, options, http.ok ? "active" : "blocked"),
      redactedUrl: redactBusTimeUrl(source.url, apiKey),
      http: redactedHttp,
    };

    if (!http.ok) {
      output.error = `HTTP ${http.status}`;
    }

    return output;
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      redactedUrl: redactBusTimeUrl(source.url, apiKey),
      error: redactSecret(errorMessage(error), apiKey),
    };
  }
}
