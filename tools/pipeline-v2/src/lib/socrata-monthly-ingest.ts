import { join } from "node:path";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { isoMonth } from "./dates.ts";
import type { OpenLocalPipelineDb } from "./local-db.ts";
import { fromRepoRoot } from "./paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "./soda3.ts";
import { writeRawSourceSnapshot } from "./source-snapshots.ts";

export type SocrataMonthlyIngestInputs = {
  readonly local: OpenLocalPipelineDb;
  readonly year: number;
  readonly month: number;
  readonly fetchedAt?: Date | undefined;
  readonly fetcher?: SocrataFetch | undefined;
  readonly manifestText?: string | undefined;
  readonly snapshotPath?: string | undefined;
};

export type SocrataMonthlyIngestResult<Extra extends Record<string, unknown>> = {
  readonly rawPath: string;
  readonly isoMonth: string;
  readonly rowCount: number;
} & Extra;

export type SocrataMonthlyIngestConfig<Row, Extra extends Record<string, unknown>> = {
  readonly sourceId: string | ((input: { readonly isoMonth: string }) => string);
  readonly rawDir: string;
  readonly rawFilePrefix: string;
  readonly queryGrain: string;
  readonly pageSize?: number | undefined;
  query(input: {
    readonly year: number;
    readonly month: number;
    readonly isoMonth: string;
  }): Soda3SoqlQuery;
  normalize(input: {
    readonly rawRows: readonly SocrataRow[];
    readonly year: number;
    readonly month: number;
    readonly isoMonth: string;
  }): readonly Row[];
  replaceRows(input: {
    readonly local: OpenLocalPipelineDb;
    readonly isoMonth: string;
    readonly rows: readonly Row[];
  }): Promise<void> | void;
  summarize(input: {
    readonly rows: readonly Row[];
    readonly rawRows: readonly SocrataRow[];
    readonly isoMonth: string;
  }): Extra;
};

export function defineSocrataMonthlyIngest<Row, Extra extends Record<string, unknown>>(
  config: SocrataMonthlyIngestConfig<Row, Extra>,
): (inputs: SocrataMonthlyIngestInputs) => Promise<SocrataMonthlyIngestResult<Extra>> {
  return async (inputs) => {
    const monthKey = isoMonth(inputs.year, inputs.month);
    const sourceId =
      typeof config.sourceId === "string"
        ? config.sourceId
        : config.sourceId({ isoMonth: monthKey });
    const manifestText =
      inputs.manifestText ??
      (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
    const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
    const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
    const rawPath =
      inputs.snapshotPath ??
      fromRepoRoot(join(config.rawDir, `${config.rawFilePrefix}-${monthKey}.json`));
    const query = config.query({
      year: inputs.year,
      month: inputs.month,
      isoMonth: monthKey,
    });
    const rawRows = [
      ...(await fetchSoda3RowsForSource(source, query, {
        fetcher: inputs.fetcher,
        pageSize: config.pageSize,
      })),
    ];
    const rows = [
      ...config.normalize({
        rawRows,
        year: inputs.year,
        month: inputs.month,
        isoMonth: monthKey,
      }),
    ];

    await config.replaceRows({
      local: inputs.local,
      isoMonth: monthKey,
      rows,
    });
    await writeRawSourceSnapshot({
      path: rawPath,
      sourceId,
      extra: { isoMonth: monthKey },
      fetchedAt,
      query: { grain: config.queryGrain, month: monthKey },
      rows: rawRows,
    });

    return {
      rawPath,
      isoMonth: monthKey,
      rowCount: rows.length,
      ...config.summarize({ rows, rawRows, isoMonth: monthKey }),
    };
  };
}
