import { join } from "node:path";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import type { OpenLocalPipelineDb } from "./local-db.ts";
import { fromRepoRoot } from "./paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "./soda3.ts";
import { writeRawSourceSnapshot } from "./source-snapshots.ts";

export type SocrataReplaceIngestInputs = {
  readonly local: OpenLocalPipelineDb;
  readonly fetchedAt?: Date | undefined;
  readonly fetcher?: SocrataFetch | undefined;
  readonly manifestText?: string | undefined;
  readonly snapshotPath?: string | undefined;
};

export type SocrataReplaceIngestResult<Extra extends Record<string, unknown>> = {
  readonly rawPath: string;
} & Extra;

export type SocrataReplaceIngestConfig<Row, Extra extends Record<string, unknown>> = {
  readonly sourceId: string;
  readonly rawDir: string;
  readonly rawFileName: string;
  readonly query: Soda3SoqlQuery;
  normalize(rawRows: readonly SocrataRow[]): readonly Row[];
  replaceRows(input: {
    readonly local: OpenLocalPipelineDb;
    readonly rows: readonly Row[];
  }): Promise<void> | void;
  summarize(input: {
    readonly rows: readonly Row[];
    readonly rawRows: readonly SocrataRow[];
  }): Extra;
};

export function defineSocrataReplaceIngest<Row, Extra extends Record<string, unknown>>(
  config: SocrataReplaceIngestConfig<Row, Extra>,
): (inputs: SocrataReplaceIngestInputs) => Promise<SocrataReplaceIngestResult<Extra>> {
  return async (inputs) => {
    const manifestText =
      inputs.manifestText ??
      (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
    const source = getSocrataSource(loadSourceManifestYaml(manifestText), config.sourceId);
    const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
    const rawPath = inputs.snapshotPath ?? fromRepoRoot(join(config.rawDir, config.rawFileName));
    const rawRows = [
      ...(await fetchSoda3RowsForSource(source, config.query, { fetcher: inputs.fetcher })),
    ];
    const rows = [...config.normalize(rawRows)];

    await config.replaceRows({ local: inputs.local, rows });
    await writeRawSourceSnapshot({
      path: rawPath,
      sourceId: config.sourceId,
      fetchedAt,
      query: config.query,
      rows: rawRows,
    });

    return {
      rawPath,
      ...config.summarize({ rows, rawRows }),
    };
  };
}
