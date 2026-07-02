import {
  type PanelManifest,
  type PanelSpec,
  parsePanelManifest,
} from "@bp/analytics/feature-history";

export type LocalDbPanelResolution<Row> = {
  readonly rows: readonly Row[];
  readonly panelManifest: PanelManifest;
};

export function uniqueSortedStrings(values: Iterable<unknown>): string[] {
  return [
    ...new Set(
      [...values].filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function buildLocalDbPanelResolutionManifest(input: {
  readonly panelSpec: PanelSpec;
  readonly generatedAt?: string | null | undefined;
  readonly inputRefs: PanelManifest["inputRefs"];
  readonly sourceRowCount: number;
  readonly supportedRowCount?: number;
  readonly panelRowCount?: number;
  readonly routeIds: readonly string[];
  readonly entityIds: readonly string[];
  readonly months: readonly string[];
  readonly limitations?: readonly string[];
}): PanelManifest {
  return parsePanelManifest({
    panelId: input.panelSpec.panelId,
    schemaVersion: input.panelSpec.schemaVersion,
    generatedAt: input.generatedAt ?? null,
    spec: input.panelSpec,
    inputRefs: input.inputRefs,
    summary: {
      sourceRowCount: input.sourceRowCount,
      supportedRowCount: input.supportedRowCount ?? input.sourceRowCount,
      panelRowCount: input.panelRowCount ?? input.sourceRowCount,
      routeCount: uniqueSortedStrings(input.routeIds).length,
      entityCount: uniqueSortedStrings(input.entityIds).length,
      monthCount: uniqueSortedStrings(input.months).length,
    },
    limitations: [
      "This manifest describes bounded local SQLite row extraction before model-level eligibility filtering.",
      ...(input.limitations ?? []),
    ],
  });
}
