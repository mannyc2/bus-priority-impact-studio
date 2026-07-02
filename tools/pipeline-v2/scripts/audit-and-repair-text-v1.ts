// Deterministic audit + repair for intervention-records-text-v1.json.
//
// Repairs applied:
//   1. Date sanitization. Any effectiveDate or statusHistory[].asOfDate with
//      a parseable year < 2000 or > 2030 is set to null. Common LLM/parser
//      failure mode: "1970" (Unix epoch). Also nulls datePrecision when
//      effectiveDate is nulled.
//   2. statusHistory dedup. Within each record, drop any entry that is a
//      "covered" subset of another entry — same status, evidenceRefs ⊆ the
//      other entry's evidenceRefs, and (asOfDate is null OR equal). The most
//      informative entry (more specific date, more evidenceRefs) wins.
//
// Outputs the repaired corpus + a sidecar audit report.

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../..");
const corpusDir = join(repoRoot, "data/artifacts/docs/gap-roadmap-docs-2026-05-25");
const inputPath = join(corpusDir, "intervention-records-text-v1.json");
const outputPath = join(corpusDir, "intervention-records-text-v1-repaired.json");
const reportPath = join(corpusDir, "intervention-records-text-v1-repair-report.json");

const MIN_PLAUSIBLE_YEAR = 2000;
const MAX_PLAUSIBLE_YEAR = 2030;

type StatusEntry = {
  status: string;
  asOfDate?: string | null;
  evidenceRefs?: string[];
  [key: string]: unknown;
};

type Record = {
  recordId: string;
  sourceId: string;
  effectiveDate?: string | null;
  datePrecision?: string | null;
  statusHistory?: StatusEntry[];
  [key: string]: unknown;
};

type Corpus = {
  documentInterventionRecords: Record[];
  [key: string]: unknown;
};

function parseYear(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isImplausibleDate(value: string | null | undefined): boolean {
  const year = parseYear(value);
  if (year === null) return false;
  return year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR;
}

function dateSpecificity(value: string | null | undefined): number {
  // Higher is more specific. null < year-only < year-month < ISO-full.
  if (value == null) return 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 3;
  if (/^\d{4}-\d{2}$/.test(value)) return 2;
  if (/^\d{4}$/.test(value)) return 1;
  return 1;
}

function isCoveredBy(b: StatusEntry, a: StatusEntry): boolean {
  // True iff entry `b` is a redundant subset of entry `a`:
  // - same status
  // - b.evidenceRefs ⊆ a.evidenceRefs
  // - b.asOfDate is null OR equals a.asOfDate (different non-null dates = real history)
  if (a.status !== b.status) return false;
  const aRefs = new Set(a.evidenceRefs ?? []);
  for (const ref of b.evidenceRefs ?? []) if (!aRefs.has(ref)) return false;
  if (b.asOfDate == null) return true;
  return a.asOfDate === b.asOfDate;
}

function repairStatusHistory(history: StatusEntry[] | undefined): {
  repaired: StatusEntry[];
  collapsedCount: number;
} {
  if (!history || history.length === 0) {
    return { repaired: history ?? [], collapsedCount: 0 };
  }

  // First sanitize asOfDate in-place.
  const sanitized: StatusEntry[] = history.map((entry) => {
    if (isImplausibleDate(entry.asOfDate)) {
      return { ...entry, asOfDate: null };
    }
    return entry;
  });

  // Rank entries from most-informative to least so the best representative of
  // each redundant cluster wins. Primary: dateSpecificity desc. Secondary:
  // evidenceRefs.length desc. Tertiary: original index asc for stability.
  const ranked = sanitized
    .map((entry, idx) => ({ entry, idx }))
    .sort((left, right) => {
      const ds = dateSpecificity(right.entry.asOfDate) - dateSpecificity(left.entry.asOfDate);
      if (ds !== 0) return ds;
      const er = (right.entry.evidenceRefs?.length ?? 0) - (left.entry.evidenceRefs?.length ?? 0);
      if (er !== 0) return er;
      return left.idx - right.idx;
    });

  // Greedily accept entries that aren't covered by any already-accepted entry.
  const accepted: StatusEntry[] = [];
  let collapsed = 0;
  for (const { entry } of ranked) {
    if (accepted.some((a) => isCoveredBy(entry, a))) {
      collapsed += 1;
      continue;
    }
    accepted.push(entry);
  }

  // Restore original input order, but only for the accepted set.
  const acceptedSet = new Set(accepted);
  const restored: StatusEntry[] = sanitized.filter((entry) => acceptedSet.has(entry));

  return { repaired: restored, collapsedCount: collapsed };
}

type RecordAudit = {
  recordId: string;
  sourceId: string;
  effectiveDateNulled: boolean;
  statusEntriesCollapsed: number;
  asOfDatesNulled: number;
};

function repairRecord(record: Record): { repaired: Record; audit: RecordAudit | null } {
  const audit: RecordAudit = {
    recordId: record.recordId,
    sourceId: record.sourceId,
    effectiveDateNulled: false,
    statusEntriesCollapsed: 0,
    asOfDatesNulled: 0,
  };

  const out: Record = { ...record };

  if (isImplausibleDate(record.effectiveDate)) {
    out.effectiveDate = null;
    out.datePrecision = null;
    audit.effectiveDateNulled = true;
  }

  // Count nulled asOfDates before dedup.
  const original = record.statusHistory ?? [];
  for (const entry of original) {
    if (isImplausibleDate(entry.asOfDate)) audit.asOfDatesNulled += 1;
  }

  const { repaired: newHistory, collapsedCount } = repairStatusHistory(original);
  if (newHistory !== original) out.statusHistory = newHistory;
  audit.statusEntriesCollapsed = collapsedCount;

  const changed =
    audit.effectiveDateNulled || audit.statusEntriesCollapsed > 0 || audit.asOfDatesNulled > 0;
  return { repaired: out, audit: changed ? audit : null };
}

async function main(): Promise<void> {
  const corpus = JSON.parse(readFileSync(inputPath, "utf8")) as Corpus;
  const records = corpus.documentInterventionRecords;

  const audits: RecordAudit[] = [];
  const repairedRecords = records.map((record) => {
    const { repaired, audit } = repairRecord(record);
    if (audit) audits.push(audit);
    return repaired;
  });

  const totals = audits.reduce(
    (acc, audit) => ({
      records: acc.records + 1,
      effectiveDateNulled: acc.effectiveDateNulled + (audit.effectiveDateNulled ? 1 : 0),
      asOfDatesNulled: acc.asOfDatesNulled + audit.asOfDatesNulled,
      statusEntriesCollapsed: acc.statusEntriesCollapsed + audit.statusEntriesCollapsed,
    }),
    { records: 0, effectiveDateNulled: 0, asOfDatesNulled: 0, statusEntriesCollapsed: 0 },
  );

  const repaired: Corpus = {
    ...corpus,
    documentInterventionRecords: repairedRecords,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    outputPath,
    repairs: {
      dateSanitization: {
        rule: `Null effectiveDate / statusHistory[].asOfDate when year < ${MIN_PLAUSIBLE_YEAR} or > ${MAX_PLAUSIBLE_YEAR}.`,
      },
      statusHistoryDedup: {
        rule: "Drop any statusHistory entry that is covered by another entry (same status, evidenceRefs is a subset, asOfDate null or equal).",
      },
    },
    totals,
    perRecord: audits,
  };

  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(repaired, null, 2)}\n`),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Records audited: ${records.length}, with repairs: ${audits.length}`);
  console.log(
    `  effectiveDate nulled: ${totals.effectiveDateNulled}, asOfDates nulled: ${totals.asOfDatesNulled}, status entries collapsed: ${totals.statusEntriesCollapsed}`,
  );
}

await main();
