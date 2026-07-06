import type { Database, SQLQueryBindings } from "bun:sqlite";
import { basename, isAbsolute, join, relative, sep } from "node:path";

export type RawListingEntry = {
  path: string;
  type: string;
  size: number;
};

export type RawFamilyLayout = "monthly-snapshots" | "partitioned" | "opaque";
export type RawFamilyVerdict = "INGESTED" | "PARTIAL" | "RAW-ONLY" | "OPAQUE" | "CONSTRAINED";
export type RawFamilyMonthGranularity =
  | "month-column"
  | "indexed-date-column"
  | "date-column-unscanned"
  | "none";

export type RawFamilyReport = {
  family: string;
  path: string;
  bytes: number;
  fileCount: number;
  months: string[];
  layout: RawFamilyLayout;
};

export type RawFamilyTableMapping = {
  table: string;
  monthColumns?: string[] | undefined;
  dateColumns?: string[] | undefined;
};

export type RawFamilyMapping = {
  family: string;
  tables: RawFamilyTableMapping[];
};

export type RawDirectReader = {
  family: string;
  reader: string;
  reason: string;
};

export type RawFamilyTableProbe = {
  table: string;
  exists: boolean;
  monthGranularity: RawFamilyMonthGranularity;
  monthColumn: string | null;
  dateColumns: string[];
  months: string[];
};

export type RawFamilySqliteProbe = {
  mappedTables: string[];
  tables: RawFamilyTableProbe[];
};

export type RawFamilyCoverage = RawFamilyReport & {
  verdict: RawFamilyVerdict;
  reason: string;
  missingMonths: string[];
  sqlite: RawFamilySqliteProbe;
  directReaders: RawDirectReader[];
  evidence: string[];
};

export type RawCoverageReport = {
  schemaVersion: 1;
  generatedAt: string;
  rawRoot: string;
  dbPath: string | null;
  summary: {
    familyCount: number;
    fileCount: number;
    bytes: number;
    verdictCounts: Record<RawFamilyVerdict, number>;
    deletionManifestFamilyCount: number;
    deletionManifestBytes: number;
  };
  families: RawFamilyCoverage[];
  deletionManifest: RawDeletionManifestEntry[];
  orphanedArtifacts: OrphanedRawArtifact[];
};

export type RawDeletionManifestEntry = {
  path: string;
  family: string;
  bytes: number;
  evidence: string[];
};

export type OrphanedRawArtifact = {
  path: string;
  status: "orphaned" | "removed";
  bytes: number | null;
  evidence: string;
};

export type RawReclaimScriptInput = {
  generatedAt: string;
  manifestPath: string;
  manifestEntries: readonly RawDeletionManifestEntry[];
  orphanedArtifacts?: readonly OrphanedRawArtifact[] | undefined;
  repoRoot?: string | undefined;
};

export type SqliteLike = Pick<Database, "query">;

const MONTHLY_SNAPSHOT_RE = /^.+-(\d{4}-\d{2})\.json$/;
const PARTITION_CHUNK_MONTH_RE =
  /(?:^|\/)[A-Za-z_][A-Za-z0-9_]*-(\d{4}-\d{2})-\d{2}-to-\d{4}-\d{2}-\d{2}(?:\/|$)/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const RAW_FAMILY_MAPPINGS: readonly RawFamilyMapping[] = [
  {
    family: "311",
    tables: [{ table: "local_311_service_request", dateColumns: ["created_date"] }],
  },
  {
    family: "dot-permits",
    tables: [
      {
        table: "local_dot_street_permit",
        dateColumns: ["permit_issue_date", "issued_work_start_date"],
      },
    ],
  },
  {
    family: "dot-traffic-volumes",
    tables: [{ table: "local_dot_traffic_volume_count", dateColumns: ["sampled_at"] }],
  },
  { family: "equity", tables: [{ table: "local_census_tract_equity_context" }] },
  { family: "express-bus-capacity", tables: [] },
  {
    family: "gtfs-rt",
    tables: [{ table: "local_gtfs_rt_feed_snapshot", dateColumns: ["fetched_at"] }],
  },
  {
    family: "gtfs-static",
    tables: [{ table: "local_gtfs_static_bundle", dateColumns: ["ingested_at"] }],
  },
  {
    family: "lion-centerline",
    tables: [
      { table: "local_lion_segment" },
      { table: "local_lion_segment_geom", dateColumns: ["built_at"] },
    ],
  },
  {
    family: "network",
    tables: [
      { table: "local_route_catalog" },
      { table: "local_route_stop" },
      { table: "local_route_shape_geom" },
    ],
  },
  {
    family: "noaa-weather",
    tables: [{ table: "local_weather_observation", dateColumns: ["date"] }],
  },
  {
    family: "nypd-collisions",
    tables: [{ table: "local_nypd_collision", dateColumns: ["crash_date"] }],
  },
  {
    family: "parking-violations",
    tables: [{ table: "local_parking_violation", dateColumns: ["issue_date"] }],
  },
  {
    family: "r2-mirror",
    tables: [{ table: "local_gtfs_rt_feed_snapshot", dateColumns: ["fetched_at"] }],
  },
  {
    family: "reliability",
    tables: [
      { table: "local_bus_wait_assessment", monthColumns: ["month"] },
      { table: "local_bus_customer_journey_metric", monthColumns: ["month"] },
    ],
  },
  {
    family: "route-slices",
    tables: [
      { table: "local_route_segment_speed", monthColumns: ["month"] },
      { table: "local_route_hourly_ridership", monthColumns: ["month"] },
      { table: "local_route_schedule_stop", dateColumns: ["schedule_date"] },
    ],
  },
  { family: "socrata-bulk", tables: [] },
  { family: "socrata-partitioned", tables: [] },
  {
    family: "socrata-partitioned/bus_hourly_ridership_2020_2024",
    tables: [{ table: "local_route_hourly_ridership", monthColumns: ["month"] }],
  },
  {
    family: "socrata-partitioned/bus_hourly_ridership_2025",
    tables: [{ table: "local_route_hourly_ridership", monthColumns: ["month"] }],
  },
  {
    family: "socrata-partitioned/bus_schedules_2023",
    tables: [{ table: "local_route_schedule_stop", dateColumns: ["schedule_date"] }],
  },
  {
    family: "socrata-partitioned/bus_schedules_2024",
    tables: [{ table: "local_route_schedule_stop", dateColumns: ["schedule_date"] }],
  },
  {
    family: "socrata-partitioned/bus_schedules_2025",
    tables: [{ table: "local_route_schedule_stop", dateColumns: ["schedule_date"] }],
  },
  {
    family: "socrata-partitioned/bus_schedules_2026",
    tables: [{ table: "local_route_schedule_stop", dateColumns: ["schedule_date"] }],
  },
  {
    family: "socrata-partitioned/nyc_dot_traffic_speeds",
    tables: [{ table: "local_dot_traffic_speed", dateColumns: ["sampled_at"] }],
  },
  { family: "socrata-partitioned-smoke", tables: [] },
  {
    family: "socrata-partitioned-smoke/bus_hourly_ridership_2025",
    tables: [{ table: "local_route_hourly_ridership", monthColumns: ["month"] }],
  },
  { family: "third-party", tables: [] },
] as const;

// Verified 2026-07-04 while planning raw JSON deprecation. Plan 039 re-greps live code.
export const RAW_DIRECT_READERS: readonly RawDirectReader[] = [
  {
    family: "network",
    reader: "tools/pipeline-v2/src/commands/studio/_release-geometry.ts",
    reason: "Studio release geometry reads data/raw/network route and stop snapshots.",
  },
  {
    family: "network",
    reader: "tools/pipeline-v2/src/commands/studio/route-treatment-summary.ts",
    reason: "Route treatment summary defaults to data/raw/network route and stop snapshots.",
  },
  {
    family: "route-slices",
    reader: "tools/pipeline-v2/src/commands/studio/release.ts",
    reason: "Studio release still defaults --route-slice-raw to data/raw/route-slices.",
  },
  {
    family: "gtfs-rt",
    reader: "tools/pipeline-v2/src/commands/collect/gtfs-rt.ts",
    reason: "GTFS-RT collectors write raw protobuf captures used by downstream import jobs.",
  },
  {
    family: "r2-mirror",
    reader: "tools/pipeline-v2/src/commands/import/gtfs-rt-r2-manifests.ts",
    reason: "R2 mirror protobuf captures remain an ingest reader source.",
  },
  {
    family: "reliability",
    reader: "tools/pipeline-v2/src/commands/audit/data-product-completeness.ts",
    reason: "Data-product completeness probes raw bus-wait-assessment reliability snapshots.",
  },
] as const;

export const RAW_ORPHANED_ARTIFACTS: readonly OrphanedRawArtifact[] = [
  {
    path: "data/artifacts/docs",
    status: "orphaned",
    bytes: null,
    evidence:
      "Tier 2 docs pipeline was deleted in plan 024; plan 038 source audit measured this orphan at about 51 GB.",
  },
  {
    path: "zero-byte SQLite stubs from plan 036",
    status: "removed",
    bytes: 0,
    evidence: "Plan 036 removed seven zero-byte local/export SQLite stub files.",
  },
] as const;

function repoRelativePath(path: string, root: string): string {
  const rel = isAbsolute(path) ? relative(root, path) : path;
  return rel.split(sep).join("/");
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function reclaimRelativePath(path: string, repoRoot: string): string {
  const rel = repoRelativePath(path, repoRoot);
  if (rel.startsWith("..") || rel.startsWith("/") || rel === "") {
    throw new Error(`Refusing reclaim path outside repo: ${path}`);
  }
  if (!rel.startsWith("data/")) {
    throw new Error(`Refusing reclaim path outside data/: ${path}`);
  }
  return rel;
}

function bytesLabel(bytes: number | null): string {
  return bytes === null ? "unknown bytes" : `${bytes} bytes`;
}

function isFileEntry(entry: RawListingEntry): boolean {
  return entry.type === "File" || entry.type === "file";
}

function isDirectoryEntry(entry: RawListingEntry): boolean {
  return entry.type === "Directory" || entry.type === "directory";
}

function extractMonthlySnapshotMonth(name: string): string | null {
  const match = MONTHLY_SNAPSHOT_RE.exec(name);
  return match?.[1] ?? null;
}

function extractPartitionChunkMonth(path: string): string | null {
  const match = PARTITION_CHUNK_MONTH_RE.exec(path);
  return match?.[1] ?? null;
}

function familyKeyForRawEntry(relativePath: string): string | null {
  const parts = relativePath.split("/");
  const [family, sourceId] = parts;
  if (!family) return null;
  if (family.startsWith("socrata-partitioned") && sourceId !== undefined) {
    return `${family}/${sourceId}`;
  }
  if (family.startsWith("socrata-partitioned")) return null;
  return family;
}

function emptyFamily(
  family: string,
  rawRoot: string,
): RawFamilyReport & { matchedMonthFiles: number } {
  return {
    family,
    path: join(rawRoot, family),
    bytes: 0,
    fileCount: 0,
    months: [],
    layout: "opaque",
    matchedMonthFiles: 0,
  };
}

export function buildRawFamilyReports(
  rawRoot: string,
  entries: readonly RawListingEntry[],
): RawFamilyReport[] {
  const families = new Map<string, RawFamilyReport & { matchedMonthFiles: number }>();

  for (const entry of entries) {
    const rel = repoRelativePath(entry.path, rawRoot);
    if (rel.startsWith("..") || rel === "" || rel.startsWith(".")) continue;
    const family = familyKeyForRawEntry(rel);
    if (!family) continue;
    if (!families.has(family)) families.set(family, emptyFamily(family, rawRoot));
    const report = families.get(family);
    if (!report) continue;

    if (isDirectoryEntry(entry)) {
      continue;
    }
    if (!isFileEntry(entry)) {
      report.layout = "opaque";
      continue;
    }

    report.fileCount += 1;
    report.bytes += entry.size;
    const month = family.startsWith("socrata-partitioned")
      ? extractPartitionChunkMonth(rel)
      : extractMonthlySnapshotMonth(basename(entry.path));
    if (month !== null) {
      report.matchedMonthFiles += 1;
      report.months = [...new Set([...report.months, month])].toSorted();
    }
  }

  for (const report of families.values()) {
    if (report.family.startsWith("socrata-partitioned")) {
      report.layout = "partitioned";
    } else if (report.fileCount > 0 && report.matchedMonthFiles === report.fileCount) {
      report.layout = "monthly-snapshots";
    } else {
      report.layout = "opaque";
    }
  }

  return [...families.values()]
    .map(({ matchedMonthFiles: _matchedMonthFiles, ...report }) => report)
    .toSorted((left, right) => right.bytes - left.bytes || left.family.localeCompare(right.family));
}

function mappingForFamily(family: string, mappings: readonly RawFamilyMapping[]): RawFamilyMapping {
  return mappings.find((mapping) => mapping.family === family) ?? { family, tables: [] };
}

function directReadersForFamily(
  family: string,
  directReaders: readonly RawDirectReader[],
): RawDirectReader[] {
  return directReaders.filter((reader) => reader.family === family);
}

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_RE.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function tableExists(sqlite: SqliteLike, table: string): boolean {
  const row = sqlite
    .query<{ present: number }, SQLQueryBindings[]>(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(table);
  return row !== null;
}

function tableColumns(sqlite: SqliteLike, table: string): string[] {
  return sqlite
    .query<{ name: string }, SQLQueryBindings[]>(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .map((row) => row.name)
    .filter((name) => typeof name === "string");
}

function leadingIndexColumns(sqlite: SqliteLike, table: string): string[] {
  const indexes = sqlite
    .query<{ name: string }, SQLQueryBindings[]>(`PRAGMA index_list(${quoteIdentifier(table)})`)
    .all()
    .map((row) => row.name)
    .filter((name) => typeof name === "string");
  const columns = new Set<string>();

  for (const index of indexes) {
    const [firstColumn] = sqlite
      .query<{ name: string | null }, SQLQueryBindings[]>(
        `PRAGMA index_info(${quoteIdentifier(index)})`,
      )
      .all();
    if (typeof firstColumn?.name === "string") {
      columns.add(firstColumn.name);
    }
  }

  return [...columns].toSorted();
}

function firstPresentColumn(
  candidates: readonly string[],
  columns: readonly string[],
): string | null {
  return candidates.find((candidate) => columns.includes(candidate)) ?? null;
}

function parseIsoMonth(month: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return null;
  if (monthNumber < 1 || monthNumber > 12) return null;
  return { year, month: monthNumber };
}

function nextIsoMonth(month: string): string {
  const parsed = parseIsoMonth(month);
  if (parsed === null) throw new Error(`Invalid ISO month: ${month}`);
  const nextMonth = parsed.month === 12 ? 1 : parsed.month + 1;
  const nextYear = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function distinctMonths(sqlite: SqliteLike, table: string, column: string): string[] {
  const tableName = quoteIdentifier(table);
  const columnName = quoteIdentifier(column);
  return sqlite
    .query<{ month: string }, SQLQueryBindings[]>(
      `SELECT DISTINCT ${columnName} AS month FROM ${tableName} WHERE ${columnName} GLOB '????-??' ORDER BY ${columnName}`,
    )
    .all()
    .map((row) => row.month)
    .filter((month) => /^\d{4}-\d{2}$/.test(month));
}

function coveredMonthsByIndexedDateColumn(
  sqlite: SqliteLike,
  table: string,
  column: string,
  months: readonly string[],
): string[] {
  const tableName = quoteIdentifier(table);
  const columnName = quoteIdentifier(column);
  const query = sqlite.query<{ present: number }, SQLQueryBindings[]>(
    `SELECT 1 AS present FROM ${tableName} WHERE ${columnName} >= ? AND ${columnName} < ? LIMIT 1`,
  );

  return months.filter((month) => {
    const start = `${month}-01`;
    const end = `${nextIsoMonth(month)}-01`;
    return query.get(start, end) !== null;
  });
}

export function probeRawFamilySqliteCoverage(
  sqlite: SqliteLike,
  families: readonly RawFamilyReport[],
  mappings: readonly RawFamilyMapping[] = RAW_FAMILY_MAPPINGS,
): Map<string, RawFamilySqliteProbe> {
  const probes = new Map<string, RawFamilySqliteProbe>();

  for (const family of families) {
    const mapping = mappingForFamily(family.family, mappings);
    const tables = mapping.tables.map((tableMapping): RawFamilyTableProbe => {
      const exists = tableExists(sqlite, tableMapping.table);
      if (!exists) {
        return {
          table: tableMapping.table,
          exists: false,
          monthGranularity: "none",
          monthColumn: null,
          dateColumns: [],
          months: [],
        };
      }

      const columns = tableColumns(sqlite, tableMapping.table);
      const leadingIndexedColumns = leadingIndexColumns(sqlite, tableMapping.table);
      const monthColumn = firstPresentColumn(
        tableMapping.monthColumns ?? ["month", "iso_month"],
        columns,
      );
      if (monthColumn !== null) {
        return {
          table: tableMapping.table,
          exists: true,
          monthGranularity: "month-column",
          monthColumn,
          dateColumns: [],
          months: distinctMonths(sqlite, tableMapping.table, monthColumn),
        };
      }

      const dateColumns = (tableMapping.dateColumns ?? []).filter((column) =>
        columns.includes(column),
      );
      const indexedDateColumn = dateColumns.find((column) =>
        leadingIndexedColumns.includes(column),
      );
      if (indexedDateColumn !== undefined) {
        return {
          table: tableMapping.table,
          exists: true,
          monthGranularity: "indexed-date-column",
          monthColumn: null,
          dateColumns,
          months: coveredMonthsByIndexedDateColumn(
            sqlite,
            tableMapping.table,
            indexedDateColumn,
            family.months,
          ),
        };
      }

      return {
        table: tableMapping.table,
        exists: true,
        monthGranularity: dateColumns.length > 0 ? "date-column-unscanned" : "none",
        monthColumn: null,
        dateColumns,
        months: [],
      };
    });

    probes.set(family.family, {
      mappedTables: mapping.tables.map((table) => table.table),
      tables,
    });
  }

  return probes;
}

function unionTableMonths(probe: RawFamilySqliteProbe): string[] {
  return [...new Set(probe.tables.flatMap((table) => table.months))].toSorted();
}

function allRawMonthsCovered(
  rawMonths: readonly string[],
  tableMonths: readonly string[],
): boolean {
  const tableSet = new Set(tableMonths);
  return rawMonths.every((month) => tableSet.has(month));
}

function verdictFor(input: {
  family: RawFamilyReport;
  sqlite: RawFamilySqliteProbe;
  directReaders: readonly RawDirectReader[];
}): Pick<RawFamilyCoverage, "verdict" | "reason" | "missingMonths" | "evidence"> {
  const existingTables = input.sqlite.tables.filter((table) => table.exists);
  const coverageTables = existingTables.filter(
    (table) =>
      table.monthGranularity === "month-column" || table.monthGranularity === "indexed-date-column",
  );
  const indexedDateTables = existingTables.filter(
    (table) => table.monthGranularity === "indexed-date-column",
  );
  const unscannedDateTables = existingTables.filter(
    (table) => table.monthGranularity === "date-column-unscanned",
  );
  const tableMonths = unionTableMonths(input.sqlite);
  const missingMonths = input.family.months.filter((month) => !tableMonths.includes(month));
  const evidence = [
    `${input.family.fileCount} raw files, ${input.family.bytes} bytes`,
    `layout=${input.family.layout}`,
    input.sqlite.mappedTables.length === 0
      ? "no mapped SQLite table"
      : `mapped SQLite tables: ${input.sqlite.mappedTables.join(", ")}`,
  ];

  if (indexedDateTables.length > 0) {
    evidence.push(
      `indexed date coverage: ${indexedDateTables
        .map((table) => `${table.table}.${table.dateColumns.join("|")}`)
        .join(", ")}`,
    );
  }
  if (unscannedDateTables.length > 0) {
    evidence.push(
      `date columns detected but not scanned: ${unscannedDateTables
        .map((table) => `${table.table}.${table.dateColumns.join("|")}`)
        .join(", ")}`,
    );
  }
  if (input.directReaders.length > 0) {
    evidence.push(
      `direct readers: ${input.directReaders.map((reader) => reader.reader).join(", ")}`,
    );
  }

  if (input.directReaders.length > 0) {
    return {
      verdict: "CONSTRAINED",
      reason: "Raw family has live direct readers and cannot enter the deletion manifest.",
      missingMonths,
      evidence,
    };
  }

  if (input.family.layout === "partitioned") {
    if (input.sqlite.mappedTables.length === 0) {
      return {
        verdict: "OPAQUE",
        reason: "Partitioned source family has no mapped SQLite table classification.",
        missingMonths,
        evidence,
      };
    }
  }

  if (input.family.layout === "opaque") {
    return {
      verdict: existingTables.length === 0 ? "RAW-ONLY" : "OPAQUE",
      reason:
        existingTables.length === 0
          ? "No mapped SQLite table exists for this raw family."
          : "Raw layout is not the verified monthly snapshot naming convention.",
      missingMonths,
      evidence,
    };
  }

  if (existingTables.length === 0) {
    return {
      verdict: "RAW-ONLY",
      reason: "No mapped SQLite table exists for this raw family.",
      missingMonths,
      evidence,
    };
  }

  if (input.family.months.length === 0) {
    return {
      verdict: "PARTIAL",
      reason: "Raw layout was classified, but no raw months could be parsed for coverage proof.",
      missingMonths,
      evidence,
    };
  }

  if (coverageTables.length === 0) {
    return {
      verdict: "PARTIAL",
      reason:
        "Mapped tables exist, but none expose a cheap month or leading-index date column for coverage proof.",
      missingMonths: [...input.family.months],
      evidence,
    };
  }

  if (!allRawMonthsCovered(input.family.months, tableMonths)) {
    return {
      verdict: "PARTIAL",
      reason:
        "At least one raw monthly snapshot month is missing from mapped SQLite month columns.",
      missingMonths,
      evidence,
    };
  }

  return {
    verdict: "INGESTED",
    reason: "Every parsed raw month appears in mapped SQLite month or leading-index date columns.",
    missingMonths: [],
    evidence,
  };
}

export function buildRawCoverageReport(input: {
  generatedAt: string;
  rawRoot: string;
  dbPath: string | null;
  families: readonly RawFamilyReport[];
  sqliteProbes: ReadonlyMap<string, RawFamilySqliteProbe>;
  directReaders?: readonly RawDirectReader[] | undefined;
  orphanedArtifacts?: readonly OrphanedRawArtifact[] | undefined;
}): RawCoverageReport {
  const directReaders = input.directReaders ?? RAW_DIRECT_READERS;
  const families = input.families.map((family): RawFamilyCoverage => {
    const sqlite = input.sqliteProbes.get(family.family) ?? {
      mappedTables: [],
      tables: [],
    };
    const readers = directReadersForFamily(family.family, directReaders);
    const verdict = verdictFor({ family, sqlite, directReaders: readers });
    return {
      ...family,
      ...verdict,
      sqlite,
      directReaders: readers,
    };
  });
  const deletionManifest = families
    .filter((family) => family.verdict === "INGESTED")
    .map(
      (family): RawDeletionManifestEntry => ({
        path: family.path,
        family: family.family,
        bytes: family.bytes,
        evidence: family.evidence,
      }),
    );
  const verdictCounts = {
    INGESTED: 0,
    PARTIAL: 0,
    "RAW-ONLY": 0,
    OPAQUE: 0,
    CONSTRAINED: 0,
  } satisfies Record<RawFamilyVerdict, number>;
  for (const family of families) {
    verdictCounts[family.verdict] += 1;
  }

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    rawRoot: input.rawRoot,
    dbPath: input.dbPath,
    summary: {
      familyCount: families.length,
      fileCount: families.reduce((sum, family) => sum + family.fileCount, 0),
      bytes: families.reduce((sum, family) => sum + family.bytes, 0),
      verdictCounts,
      deletionManifestFamilyCount: deletionManifest.length,
      deletionManifestBytes: deletionManifest.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    families,
    deletionManifest,
    orphanedArtifacts: [...(input.orphanedArtifacts ?? RAW_ORPHANED_ARTIFACTS)],
  };
}

export function buildRawReclaimScript(input: RawReclaimScriptInput): string {
  const repoRoot = input.repoRoot ?? process.cwd();
  const orphanedArtifacts = (input.orphanedArtifacts ?? []).filter(
    (artifact) => artifact.status === "orphaned",
  );
  const knownBytes =
    input.manifestEntries.reduce((sum, entry) => sum + entry.bytes, 0) +
    orphanedArtifacts.reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);
  const manifestPath = repoRelativePath(input.manifestPath, repoRoot);
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `# Generated ${input.generatedAt}`,
    `# Source manifest: ${manifestPath}`,
    `# Known reclaim bytes: ${knownBytes}`,
    "# OPERATOR-RUN ONLY - review every rm line before executing.",
    "",
    'repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"',
    'cd "$repo_root"',
    'sqlite_bytes="$(stat -c%s data/local/pipeline.sqlite 2>/dev/null || echo 0)"',
    '[ "$sqlite_bytes" -gt 100000000000 ] || { echo "canonical sqlite missing/small; abort"; exit 1; }',
    "",
  ];

  for (const entry of input.manifestEntries) {
    const path = reclaimRelativePath(entry.path, repoRoot);
    lines.push(
      `# ${entry.family} - ${bytesLabel(entry.bytes)} - ${entry.evidence[0] ?? "manifest entry"}`,
      `rm -rf -- ${shellSingleQuote(path)}`,
      "",
    );
  }

  for (const artifact of orphanedArtifacts) {
    const path = reclaimRelativePath(artifact.path, repoRoot);
    lines.push(
      `# orphaned artifact - ${bytesLabel(artifact.bytes)} - ${artifact.evidence}`,
      `rm -rf -- ${shellSingleQuote(path)}`,
      "",
    );
  }

  lines.push("df -h /mnt/models", "");
  return `${lines.join("\n")}`;
}
