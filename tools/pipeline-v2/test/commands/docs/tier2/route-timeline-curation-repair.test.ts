import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { repairRouteTimelineCuration } from "../../../../src/commands/docs/tier2/_route-timeline-curation-repair.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-curation-repair");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function seedPack() {
  const packPath = join(workingRoot, "pack.json");
  await writeJson(packPath, {
    artifactKind: "bp.tier2_route_timeline_curation_pack.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-07T04:00:00.000Z",
    routeId: "B46",
    sourceRefs: [],
    candidates: [
      {
        candidateRef: "c001",
        candidateId: "timeline_candidate_launch",
        dateAssertions: [
          {
            dateAssertionRef: "c001.d1",
            dateAssertionId: "date_launch_month",
            candidateId: "timeline_candidate_launch",
            sourcePath: "canonicalPayload.dateText",
            rawText: "July 2016",
            date: null,
            month: "2016-07",
            datePrecision: "month",
            dateRole: "event_date_candidate",
            confidence: "medium",
          },
        ],
      },
      {
        candidateRef: "c002",
        candidateId: "timeline_candidate_tbd",
        dateAssertions: [
          {
            dateAssertionRef: "c002.d1",
            dateAssertionId: "date_project_tbd",
            candidateId: "timeline_candidate_tbd",
            sourcePath: "canonicalPayload.dateText",
            rawText: "TBD",
            date: null,
            month: null,
            datePrecision: "unknown",
            dateRole: "event_date_candidate",
            confidence: "medium",
          },
        ],
      },
    ],
  });
  return { packPath };
}

describe("route timeline curation repair", () => {
  test("backfills omitted dateAssertionRefs from deterministic validation suggestions", async () => {
    const { packPath } = await seedPack();
    const toolCallPath = join(workingRoot, "tool-call.json");
    const outputPath = join(workingRoot, "tool-call-repaired.json");
    const summaryPath = join(workingRoot, "repair-summary.json");
    const validationPath = join(workingRoot, "repair-validation.json");
    await writeJson(toolCallPath, {
      schemaVersion: 1,
      routeId: "B46",
      events: [
        {
          eventId: "b46_sbs_launch",
          title: "B46 SBS launches",
          eventStatus: "implemented",
          timelineLayer: "service_change",
          routeScope: "direct_route",
          summary: "The source states that B46 SBS launched in July 2016.",
          whyItMatters: "This is the route's core service-change milestone.",
          candidateRefs: ["c001"],
          dateAssertionRefs: [],
          confidence: "high",
          reviewNotes: [],
        },
        {
          eventId: "b46_project_tbd",
          title: "B46 project date TBD",
          eventStatus: "planned",
          timelineLayer: "project_milestone",
          routeScope: "direct_route",
          summary: "The source lists this project date as TBD.",
          whyItMatters: "The unresolved date is itself source-backed.",
          candidateRefs: ["c002"],
          dateAssertionRefs: [],
          confidence: "medium",
          reviewNotes: [],
        },
      ],
      excludedCandidates: [],
    });

    const result = await repairRouteTimelineCuration({
      packPath,
      toolCallPath,
      outputPath,
      summaryPath,
      validationPath,
      generatedAt: "2026-06-07T04:30:00.000Z",
    });

    expect(result.summary).toMatchObject({
      repairedEventCount: 2,
      addedDateAssertionRefCount: 2,
      repairedUnknownPrecisionEventCount: 1,
      beforeValidation: {
        status: "accepted",
        warnings: 2,
        byCode: { date_assertion_available: 2 },
      },
      afterValidation: {
        status: "accepted",
        warnings: 0,
        byCode: {},
      },
    });
    expect(result.toolCall.events[0]?.dateAssertionRefs).toEqual(["c001.d1"]);
    expect(result.toolCall.events[1]?.dateAssertionRefs).toEqual(["c002.d1"]);
    expect(await Bun.file(outputPath).json()).toMatchObject({
      events: [{ dateAssertionRefs: ["c001.d1"] }, { dateAssertionRefs: ["c002.d1"] }],
    });
    expect(await Bun.file(summaryPath).exists()).toBe(true);
    expect(await Bun.file(validationPath).exists()).toBe(true);
  });

  test("leaves events with existing date refs unchanged", async () => {
    const { packPath } = await seedPack();
    const toolCallPath = join(workingRoot, "tool-call-existing.json");
    await writeJson(toolCallPath, {
      schemaVersion: 1,
      routeId: "B46",
      events: [
        {
          eventId: "b46_sbs_launch",
          title: "B46 SBS launches",
          eventStatus: "implemented",
          timelineLayer: "service_change",
          routeScope: "direct_route",
          summary: "The source states that B46 SBS launched in July 2016.",
          whyItMatters: "This is the route's core service-change milestone.",
          candidateRefs: ["c001"],
          dateAssertionRefs: ["c001.d1"],
          confidence: "high",
          reviewNotes: [],
        },
      ],
      excludedCandidates: [{ candidateRef: "c002", reason: "missing_date", notes: "Not used." }],
    });

    const result = await repairRouteTimelineCuration({
      packPath,
      toolCallPath,
      outputPath: join(workingRoot, "tool-call-existing-repaired.json"),
      generatedAt: "2026-06-07T04:30:00.000Z",
    });

    expect(result.summary).toMatchObject({
      repairedEventCount: 0,
      skippedAlreadyDatedEventCount: 1,
      afterValidation: { status: "accepted", warnings: 0 },
    });
    expect(result.toolCall.events[0]?.dateAssertionRefs).toEqual(["c001.d1"]);
  });
});
