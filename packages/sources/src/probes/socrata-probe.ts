import * as z from "zod";
import {
  buildSocrataColumnsUrl,
  buildSocrataMetadataUrl,
  buildSoda3ExportUrl,
  buildSoda3QueryUrl,
  createSoda3Client,
  parseSocrataMetadata,
  SocrataColumnSchema,
} from "../clients/socrata/index.js";
import type { SocrataManifestSource } from "../registry/manifest.js";
import {
  createBaseProbe,
  errorMessage,
  type FetchLike,
  type ProbeOptions,
  type SourceProbeOutput,
} from "./contracts.js";
import { fetchJson } from "./transports/fetch.js";

const SocrataColumnsSchema = z.array(SocrataColumnSchema);

function rowsUpdatedAtIso(rowsUpdatedAt: number | undefined): string | undefined {
  if (rowsUpdatedAt === undefined) {
    return undefined;
  }

  return new Date(rowsUpdatedAt * 1000).toISOString();
}

function buildSocrataRowCountUrl(source: SocrataManifestSource): string {
  return buildSoda3QueryUrl(source.domain, source.dataset_id).toString();
}

async function fetchSocrataRowCount(
  source: SocrataManifestSource,
  fetcher: FetchLike,
): Promise<number> {
  return createSoda3Client({ domain: source.domain, fetcher }).rowCount(source.dataset_id);
}

function withSocrataSummary(
  output: SourceProbeOutput,
  update: NonNullable<SourceProbeOutput["socrata"]>,
): SourceProbeOutput {
  return {
    ...output,
    socrata: update,
  };
}

export async function probeSocrataSource(
  source: SocrataManifestSource,
  options: ProbeOptions = {},
): Promise<SourceProbeOutput> {
  const metadataUrl = buildSocrataMetadataUrl(source.domain, source.dataset_id).toString();
  const columnsUrl = buildSocrataColumnsUrl(source.domain, source.dataset_id).toString();
  const rowsCsvUrl = buildSoda3ExportUrl(source.domain, source.dataset_id, "csv").toString();
  const rowCountUrl = buildSocrataRowCountUrl(source);
  const fetcher = options.fetcher ?? fetch;

  try {
    const metadata = parseSocrataMetadata(await fetchJson(metadataUrl, fetcher));
    const columns = SocrataColumnsSchema.parse(await fetchJson(columnsUrl, fetcher));
    const rowsUpdatedAt = metadata.rowsUpdatedAt;
    const updatedIso = rowsUpdatedAtIso(rowsUpdatedAt);

    if (metadata.id !== source.dataset_id) {
      return {
        ...createBaseProbe(source, options, "blocked"),
        url: source.url,
        error: `Metadata id ${metadata.id} did not match manifest dataset id ${source.dataset_id}.`,
      };
    }

    let output: SourceProbeOutput = {
      ...createBaseProbe(source, options, "active"),
      url: source.url,
      socrata: {
        datasetId: source.dataset_id,
        domain: source.domain,
        metadataUrl,
        columnsUrl,
        rowsCsvUrl,
        rowCountUrl,
        name: metadata.name,
        columnCount: columns.length,
      },
      socrataDataset: {
        metadata,
        columns,
      },
    };

    let socrata = output.socrata;
    if (socrata === undefined) {
      throw new Error("Internal error: missing Socrata probe summary.");
    }

    if (rowsUpdatedAt !== undefined) {
      socrata = {
        ...socrata,
        rowsUpdatedAt,
      };
      output = withSocrataSummary(output, socrata);
    }

    if (updatedIso !== undefined) {
      socrata = {
        ...socrata,
        rowsUpdatedAtIso: updatedIso,
      };
      output = withSocrataSummary(output, socrata);
    }

    try {
      const rowCount = await fetchSocrataRowCount(source, fetcher);
      socrata = {
        ...socrata,
        rowCount,
      };
      output = withSocrataSummary(output, socrata);
    } catch (error) {
      socrata = {
        ...socrata,
        rowCountError: errorMessage(error),
      };
      output = withSocrataSummary(output, socrata);
    }

    return output;
  } catch (error) {
    return {
      ...createBaseProbe(source, options, "blocked"),
      url: source.url,
      error: errorMessage(error),
    };
  }
}
