import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteTimelineBundleIndex } from "../../../../src/commands/docs/tier2/_route-timeline-bundle-index.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-bundle-index");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

function event(input: {
  eventId: string;
  title: string;
  displayLayer: "default" | "secondary" | "review_only";
  displayDate?: string;
  dateAssertionRefs?: string[];
  qualityFlags?: string[];
}) {
  return {
    eventId: input.eventId,
    routeId: "B46",
    title: input.title,
    summary: input.title,
    whyItMatters: input.title,
    date: null,
    month: null,
    rangeStart: null,
    rangeEnd: null,
    datePrecision: input.dateAssertionRefs === undefined ? "unknown" : "month",
    displayDate: input.displayDate ?? "date unresolved",
    dateSource: input.dateAssertionRefs === undefined ? "unresolved" : "date_assertion_ref",
    layer: "service_change",
    status: "implemented",
    routeScope: "direct_route",
    confidence: "high",
    displayLayer: input.displayLayer,
    candidateRefs: ["c001"],
    candidateIds: ["candidate-1"],
    dateAssertionRefs: input.dateAssertionRefs ?? [],
    dateAssertionIds: [],
    sourceChips: [
      {
        sourceRef: "s001",
        sourceId: "source-a",
        title: "Source A",
        sourceGroup: "doc",
        pages: [3],
        candidateRefs: ["c001"],
      },
    ],
    citationRefs: [],
    affectedRouteIds: ["B46"],
    affectedSegments: [],
    relatedTreatmentFamilies: [],
    relatedEventFamilies: [],
    suggestedAnalysisWindow: {
      status: input.dateAssertionRefs === undefined ? "not_applicable" : "available",
      grain: input.dateAssertionRefs === undefined ? null : "month",
      beforeStart: null,
      beforeEnd: null,
      afterStart: null,
      afterEnd: null,
      notes: "",
    },
    qualityFlags: input.qualityFlags ?? [],
    reviewNotes: [],
  };
}

async function writeBundle(input: {
  routeId: string;
  path: string;
  defaultEvents: number;
  reviewOnlyEvents: number;
  unresolvedDates: number;
  validationWarnings?: number;
  totalTokens?: number;
}) {
  const defaultEvents = Array.from({ length: input.defaultEvents }, (_, index) =>
    event({
      eventId: `${input.routeId.toLowerCase()}_default_${index}`,
      title: `${input.routeId} default ${index}`,
      displayLayer: "default",
      displayDate: `2016-0${index + 1}`,
      dateAssertionRefs: [`c00${index + 1}.d1`],
    }),
  );
  const reviewOnlyEvents = Array.from({ length: input.reviewOnlyEvents }, (_, index) =>
    event({
      eventId: `${input.routeId.toLowerCase()}_review_${index}`,
      title: `${input.routeId} review ${index}`,
      displayLayer: "review_only",
      qualityFlags: ["unresolved_date"],
    }),
  );
  await writeJson(input.path, {
    artifactKind: "bp.tier2_route_timeline_bundle.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-07T05:00:00.000Z",
    routeId: input.routeId,
    sourcePackPath: "/repo/pack.json",
    sourceToolCallPath: "/repo/tool-call.json",
    sourceRunPath: "/repo/run.json",
    validation: { issues: [] },
    summary: {
      eventCount: defaultEvents.length + reviewOnlyEvents.length,
      excludedCandidateCount: 0,
      defaultEventCount: defaultEvents.length,
      secondaryEventCount: 0,
      reviewOnlyEventCount: reviewOnlyEvents.length,
      sourceBackedEventCount: defaultEvents.length + reviewOnlyEvents.length,
      dateAssertionBackedEventCount: defaultEvents.length,
      resolvedDateEventCount: defaultEvents.length,
      legacyDateEventCount: 0,
      unresolvedDateEventCount: input.unresolvedDates,
      lowConfidenceEventCount: 0,
      unaccountedCandidateCount: 1,
      validationErrorCount: 0,
      validationWarningCount: input.validationWarnings ?? 0,
      usage: input.totalTokens === undefined ? null : { total_tokens: input.totalTokens },
    },
    frontendContract: {
      defaultDisplayLayer: "default",
      secondaryLayers: [],
      detailAffordances: [],
      notes: [],
    },
    events: [...defaultEvents, ...reviewOnlyEvents],
    excludedCandidates: [],
  });
}

describe("route timeline bundle index", () => {
  test("summarizes route timeline readiness across bundles", async () => {
    const readyPath = join(workingRoot, "b46-bundle.json");
    const sparsePath = join(workingRoot, "m15-bundle.json");
    const outputPath = join(workingRoot, "index.json");
    await writeBundle({
      routeId: "B46",
      path: readyPath,
      defaultEvents: 3,
      reviewOnlyEvents: 1,
      unresolvedDates: 1,
      totalTokens: 100,
    });
    await writeBundle({
      routeId: "M15",
      path: sparsePath,
      defaultEvents: 1,
      reviewOnlyEvents: 4,
      unresolvedDates: 4,
      totalTokens: 50,
    });

    const result = await buildRouteTimelineBundleIndex({
      bundlePaths: [sparsePath, readyPath],
      outputPath,
      generatedAt: "2026-06-07T06:00:00.000Z",
    });

    expect(result.artifact.summary).toMatchObject({
      routeCount: 2,
      timelineReadyCount: 1,
      timelineSparseCount: 1,
      defaultEventCount: 4,
      unresolvedDateEventCount: 5,
      validationWarningCount: 0,
      totalTokens: 150,
    });
    expect(result.artifact.routeRows.map((row) => row.routeId)).toEqual(["B46", "M15"]);
    expect(result.artifact.routeRows[0]).toMatchObject({
      routeId: "B46",
      supportLevel: "timeline_ready",
      defaultEventCount: 3,
      unaccountedCandidateCount: 1,
    });
    expect(result.artifact.routeRows[1]).toMatchObject({
      routeId: "M15",
      supportLevel: "timeline_sparse",
      qualityFlags: expect.arrayContaining(["low_default_event_count", "review_heavy"]),
    });
    expect(await Bun.file(result.markdownPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("Route Timeline Bundle Index");
    expect(markdown).toContain("| B46 | timeline_ready |");
  });
});
