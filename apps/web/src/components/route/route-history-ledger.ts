import type { RouteInterventionViewModel } from "@/components/route/route-intervention-model";
import type { StudioIntervention, StudioRouteEvidenceBundle } from "@/studio/api-contract";
import {
  type ChangeDate,
  changeDateGroupLabel,
  compareChangeDatesNewestFirst,
  parseChangeDate,
} from "@/studio/change-date";

export const HISTORY_CONTROL_THRESHOLD = 12;
export const HISTORY_PAGE_SIZE = 20;
export type HistoryLedgerKind = "event" | "treatment" | "project" | "source_gap";

export type HistoryLedgerRow = {
  key: string;
  recordId: string;
  relatedRecordIds: string[];
  kind: HistoryLedgerKind;
  dateLabel: string;
  /** The typed reading of `dateLabel`; ordering and grouping read this. */
  date: ChangeDate;
  title: string;
  detail: string;
  statusLabel: string | null;
  citationKeys: string[];
  sourceLabels: string[];
};

export type HistoryLedgerGroup = { year: string; rows: HistoryLedgerRow[] };

type LedgerRowInput = Pick<HistoryLedgerRow, "recordId" | "kind" | "title"> & {
  dateLabel?: string | undefined;
  detail?: string | undefined;
  statusLabel?: string | null | undefined;
  citationKeys?: readonly string[] | undefined;
  sourceLabels?: readonly string[] | undefined;
};

export function buildRouteHistoryLedger({
  interventions,
  evidence,
  model,
}: {
  interventions: readonly StudioIntervention[];
  evidence: StudioRouteEvidenceBundle | null;
  model: RouteInterventionViewModel;
}): HistoryLedgerRow[] {
  const rows = new Map<string, HistoryLedgerRow>();
  const rowKeyById = new Map<string, string>();
  const treatmentById = new Map(model.treatments.map((row) => [row.key, row]));
  const representedTreatments = new Set<string>();

  const put = (input: LedgerRowInput, aliases: readonly (string | null | undefined)[] = []) => {
    const key = `${input.kind}:${input.recordId}`;
    const availableAliases = [
      ...new Set(
        aliases.filter((id): id is string => id !== null && id !== undefined && id.length > 0),
      ),
    ].filter((id) => !rowKeyById.has(id) && id !== input.recordId);
    const dateLabel = input.dateLabel ?? "Undated";
    rows.set(key, {
      key,
      recordId: input.recordId,
      relatedRecordIds: availableAliases,
      kind: input.kind,
      dateLabel,
      date: parseChangeDate(dateLabel),
      title: input.title,
      detail: input.detail ?? "No structured description provided.",
      statusLabel: input.statusLabel ?? null,
      citationKeys: [...new Set(input.citationKeys ?? [])],
      sourceLabels: [...(input.sourceLabels ?? [])],
    });
    rowKeyById.set(input.recordId, key);
    for (const id of availableAliases) rowKeyById.set(id, key);
  };
  const merge = (
    recordId: string,
    citationKeys: readonly string[] = [],
    sourceLabels: readonly string[] = [],
  ): boolean => {
    const key = rowKeyById.get(recordId);
    const row = key === undefined ? undefined : rows.get(key);
    if (row === undefined) return false;
    row.citationKeys = [...new Set([...row.citationKeys, ...citationKeys])];
    row.sourceLabels.push(...sourceLabels);
    return true;
  };

  for (const occurrenceRow of model.timeline) {
    const { occurrence } = occurrenceRow;
    const labels = occurrenceRow.treatmentRows.map((row) => row.presentation.label);
    const treatmentAliases = occurrence.treatmentIds.flatMap((id) => {
      if (representedTreatments.has(id)) return [];
      representedTreatments.add(id);
      const treatment = treatmentById.get(id)?.treatment;
      return treatment === undefined ? [id] : [id, treatment.sourceRecordId];
    });
    put(
      {
        recordId: occurrence.occurrenceId,
        kind: "treatment",
        title: occurrence.program ?? occurrence.phase ?? labels[0] ?? "Treatment occurrence",
        dateLabel: occurrence.effectiveDate ?? "Undated",
        detail:
          [
            labels.join(", "),
            occurrence.phase ?? "",
            occurrence.lifecycleState.replaceAll("_", " "),
          ]
            .filter(Boolean)
            .join(" — ") || "Typed treatment occurrence.",
        statusLabel: occurrenceRow.treatmentRows[0]?.lifecycleLabel,
        sourceLabels: [occurrence.sourceId, ...occurrence.sourceRefs],
      },
      [
        occurrence.sourceOccurrenceId,
        occurrence.wikiOccurrenceId,
        occurrence.registryLineage?.eventId,
        ...treatmentAliases,
      ],
    );
  }

  for (const row of model.treatments) {
    if (representedTreatments.has(row.key)) continue;
    const treatment = row.treatment;
    put(
      {
        recordId: treatment.treatmentId,
        kind: "treatment",
        title: row.presentation.label,
        dateLabel: treatment.effectiveDate ?? "Undated",
        detail: `${row.presentation.familyLabel} — ${row.lifecycleLabel.toLowerCase()}.`,
        statusLabel: row.lifecycleLabel,
        sourceLabels: [treatment.sourceId, ...treatment.sourceRefs],
      },
      [treatment.sourceRecordId],
    );
  }

  for (const [index, intervention] of interventions.entries()) {
    const recordId = intervention.eventId ?? `serving:${intervention.year}:${index}`;
    const source = intervention.sourceLabel ?? intervention.sourceDetail;
    if (intervention.eventId !== undefined && merge(recordId, [], source ? [source] : [])) {
      continue;
    }
    put({
      recordId,
      kind: "event",
      title: intervention.title,
      dateLabel: intervention.year,
      detail: intervention.detail,
      sourceLabels: source ? [source] : [],
    });
  }

  for (const event of evidence?.timeline ?? []) {
    if (merge(event.recordId, event.citationKeys)) continue;
    put({
      recordId: event.recordId,
      kind: "event",
      title: event.title ?? event.eventKind ?? "Documented route event",
      dateLabel: event.dateNormalized ?? event.dateText ?? "Undated",
      detail: event.description ?? event.lifecyclePhase ?? undefined,
      statusLabel: lifecycleLabel(event.lifecyclePhase),
      citationKeys: event.citationKeys,
    });
  }

  for (const intervention of evidence?.interventions ?? []) {
    if (merge(intervention.recordId, intervention.citationKeys)) continue;
    put({
      recordId: intervention.recordId,
      kind: "treatment",
      title: intervention.title ?? humanize(intervention.treatmentKind) ?? "Documented treatment",
      detail:
        intervention.description ??
        (intervention.locations.length > 0
          ? `Locations: ${intervention.locations.join(", ")}`
          : undefined),
      citationKeys: intervention.citationKeys,
    });
  }

  const projectRelations = new Map(model.projects.map((project) => [project.projectId, project]));
  const evidenceProjectIds = new Set<string>();
  for (const project of evidence?.projects ?? []) {
    evidenceProjectIds.add(project.recordId);
    const relation = projectRelations.get(project.recordId);
    put({
      recordId: project.recordId,
      kind: "project",
      title: project.projectName ?? "Documented project",
      detail: project.description ?? project.location ?? undefined,
      statusLabel: project.status,
      citationKeys: [...project.citationKeys, ...(relation?.citationKeys ?? [])],
    });
  }
  for (const project of model.projects) {
    if (evidenceProjectIds.has(project.projectId)) continue;
    put({
      recordId: project.projectId,
      kind: "project",
      title: "Documented project relationship",
      detail: `${project.treatmentIds.length} treatments and ${project.occurrenceIds.length} occurrences are linked by the typed inventory.`,
      citationKeys: project.citationKeys,
    });
  }

  for (const gap of evidence?.sourceGaps ?? []) {
    put({
      recordId: gap.recordId,
      kind: "source_gap",
      title: humanize(gap.gapKind) ?? "Documented source gap",
      detail: gap.description ?? gap.missingInformation ?? gap.gapText ?? undefined,
      statusLabel: "Source gap",
      citationKeys: gap.citationKeys,
    });
  }
  for (const gap of model.gaps) {
    if (merge(gap.gapId, [], gap.sourceRefs)) continue;
    put({
      recordId: gap.gapId,
      kind: "source_gap",
      title: humanize(gap.gapKind) ?? "Documented source gap",
      detail: `Missing evidence from ${gap.sourceId}.`,
      statusLabel: "Source gap",
      sourceLabels: gap.sourceRefs,
    });
  }

  return [...rows.values()].sort(compareLedgerRows);
}

export function filterRouteHistoryLedger(
  rows: readonly HistoryLedgerRow[],
  filters: { query?: string | undefined; kind?: HistoryLedgerKind | undefined },
): HistoryLedgerRow[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return rows.filter(
    (row) =>
      (filters.kind === undefined || row.kind === filters.kind) &&
      (query.length === 0 ||
        [row.dateLabel, row.title, row.detail, row.statusLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
}

export function groupRouteHistoryLedger(rows: readonly HistoryLedgerRow[]): HistoryLedgerGroup[] {
  const groups: HistoryLedgerGroup[] = [];
  for (const row of rows) {
    const year = changeDateGroupLabel(row.date);
    const last = groups.at(-1);
    if (last?.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }
  return groups;
}

/**
 * The group heading a raw date label belongs under: its calendar year, the
 * "2013–2014" span for a multi-year interval, or "Undated" when no date can be
 * read. Reads through the one date parser, so callers holding only a label
 * agree with callers holding a typed date.
 */
export function historyYearLabel(dateLabel: string): string {
  return changeDateGroupLabel(parseChangeDate(dateLabel));
}

function compareLedgerRows(left: HistoryLedgerRow, right: HistoryLedgerRow): number {
  const byDate = compareChangeDatesNewestFirst(left.date, right.date);
  if (byDate !== 0) return byDate;
  const order: Record<HistoryLedgerKind, number> = {
    event: 0,
    treatment: 1,
    project: 2,
    source_gap: 3,
  };
  return order[left.kind] - order[right.kind] || left.title.localeCompare(right.title);
}

function lifecycleLabel(value: string | null): string | null {
  return value === null ? null : humanize(value);
}

function humanize(value: string | null): string | null {
  return value?.replaceAll("_", " ") ?? null;
}
