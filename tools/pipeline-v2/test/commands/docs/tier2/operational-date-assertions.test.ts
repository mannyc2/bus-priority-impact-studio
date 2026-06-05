import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildOperationalDateAssertion,
  runTier2OperationalDateAssertions,
} from "../../../../src/commands/docs/tier2/_operational-date-assertions.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-operational-date-assertions");

function event(input: {
  surfaceId: string;
  displayLabel: string;
  rawFamily: string;
  treatmentText?: string;
  dateText?: string;
  statusRaw?: string | null;
  eventStatus?: string;
}) {
  return {
    surfaceId: input.surfaceId,
    surfaceKind: "event",
    sourceId: `source-${input.surfaceId}`,
    sourceTitle: "Fixture Source",
    sourceGroup: "fixture",
    displayLabel: input.displayLabel,
    eventName: input.displayLabel,
    canonicalFamily: "implementation_milestone",
    rawFamily: input.rawFamily,
    eventFamily: input.rawFamily,
    eventStatus: input.eventStatus ?? "implemented",
    dateText: input.dateText ?? "October 3, 2019",
    datePrecision: "day",
    ...(input.treatmentText ? { treatmentText: input.treatmentText } : {}),
    evidenceRefs: [
      { sourceId: `source-${input.surfaceId}`, pageNumber: 1, blockId: "B0001", lineStart: 2, lineEnd: 2 },
    ],
    rawCandidate: {
      statusRaw: input.statusRaw === undefined ? "completed" : input.statusRaw,
      familyRaw: input.rawFamily,
      subtypeRaw: "busway_implementation",
      evidenceRefs: [
        {
          blockId: "B0001",
          pageNumber: 1,
          lineStart: 2,
          lineEnd: 2,
          blockHash: "sha256:abc",
          roleRaw: "start_date",
        },
      ],
    },
  };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 operational-date assertions", () => {
  test("completed busway with a stated date -> trusted operational date, evidence preserved", () => {
    const assertion = buildOperationalDateAssertion(
      event({
        surfaceId: "busway",
        displayLabel: "14th Street busway launch",
        rawFamily: "busway_implementation",
        treatmentText: "transit and truck priority corridor",
        statusRaw: "completed",
      }),
    );
    expect(assertion.validationState).toBe("source_stated_operational_date");
    expect(assertion.trustedOperationalDate).toBe(true);
    expect(assertion.operationalDate).toBe("October 3, 2019");
    expect(assertion.statusRaw).toBe("completed");
    // verbatim source provenance, including the source's own date role
    expect(assertion.evidenceRefs[0]?.roleRaw).toBe("start_date");
  });

  test("scheduled launch -> source-stated planned date (trusted per source)", () => {
    const assertion = buildOperationalDateAssertion(
      event({
        surfaceId: "planned",
        displayLabel: "B46 SBS launch",
        rawFamily: "service_launch",
        treatmentText: "Select Bus Service",
        statusRaw: "scheduled",
      }),
    );
    expect(assertion.validationState).toBe("source_stated_planned_date");
    expect(assertion.trustedOperationalDate).toBe(true);
  });

  test("public engagement is a non-operational milestone", () => {
    const assertion = buildOperationalDateAssertion(
      event({
        surfaceId: "meeting",
        displayLabel: "Public meeting for the M14 corridor",
        rawFamily: "public_meeting",
        treatmentText: "bus lane",
        statusRaw: "completed",
      }),
    );
    expect(assertion.validationState).toBe("non_operational_milestone");
    expect(assertion.trustedOperationalDate).toBe(false);
  });

  test("writes the artifact with a validation-state summary", async () => {
    const eventsPath = join(workingRoot, "events.jsonl");
    const outputPath = join(workingRoot, "operational-date-assertions.json");
    await Bun.write(
      eventsPath,
      [
        event({ surfaceId: "busway", displayLabel: "14th Street busway launch", rawFamily: "busway_implementation", treatmentText: "transit and truck priority", statusRaw: "completed" }),
        event({ surfaceId: "meeting", displayLabel: "Public workshop", rawFamily: "public_meeting", statusRaw: "completed" }),
      ]
        .map((row) => JSON.stringify(row))
        .join("\n"),
    );

    const result = await runTier2OperationalDateAssertions({
      surfacesDir: workingRoot,
      eventsPath,
      outputPath,
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(result.artifact.summary.inputEventCount).toBe(2);
    expect(result.artifact.summary.trustedOperationalDateCount).toBe(1);
    expect(result.artifact.summary.countsByValidationState["source_stated_operational_date"]).toBe(1);
    expect(result.artifact.summary.countsByValidationState["non_operational_milestone"]).toBe(1);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
