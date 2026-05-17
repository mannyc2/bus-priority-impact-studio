import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { checkBusObservatoryAvailability } from "../src/jobs/check/bus-observatory-availability.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const outputPath = fromRepoRoot(
  join("data/fixtures/bus-observatory-availability/march-availability.json"),
);

afterEach(async () => {
  await rm(dirname(outputPath), { recursive: true, force: true });
});

function s3Xml(objects: { key: string; size: number; modified?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
${objects
  .map(
    (object) => `<Contents>
  <Key>${object.key}</Key>
  <LastModified>${object.modified ?? "2026-03-01T18:03:08.000Z"}</LastModified>
  <Size>${object.size}</Size>
</Contents>`,
  )
  .join("\n")}
</ListBucketResult>`;
}

function compactedKey(date: string): string {
  return `feeds/nyct_mta_bus_gtfsrt/COMPACTED_nyct_mta_bus_gtfsrt_${date}_18:03:00.parquet`;
}

function fixtureFetcher(monthDates: string[], bridgeDates: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    const href = String(url);
    const dates = href.includes("2026-04-01") ? bridgeDates : monthDates;
    return new Response(
      s3Xml(dates.map((date, index) => ({ key: compactedKey(date), size: 1000 + index }))),
      {
        status: 200,
      },
    );
  }) as typeof fetch;
}

describe("Bus Observatory GTFS-RT availability", () => {
  test("marks a month with daily files plus bridge file as a third-party full-month candidate", async () => {
    const marchDates = Array.from(
      { length: 31 },
      (_, index) => `2026-03-${String(index + 1).padStart(2, "0")}`,
    );

    const result = await checkBusObservatoryAvailability({
      year: 2026,
      month: 3,
      output: outputPath,
      fetcher: fixtureFetcher(marchDates, ["2026-04-01"]),
    });

    expect(result.coverage).toEqual(
      expect.objectContaining({
        status: "full_month_candidate",
        candidateLabel: "third_party_full_month_candidate_pending_row_level_qa",
        fileCount: 32,
        bridgeFileDate: "2026-04-01",
        bridgeFilePresent: true,
        missingMonthFileDates: [],
      }),
    );
    expect(result.provenance).toEqual(
      expect.objectContaining({
        gtfsRtSource: "third_party_recovered",
        officialMtaBackfill: false,
        officialSelfCollected: false,
      }),
    );
    expect(result.provider).toEqual(
      expect.objectContaining({
        license: "CC BY-NC 4.0",
        attributionRequired: true,
      }),
    );
    expect(result.qa.checksBeforeUse).toEqual(
      expect.arrayContaining([
        "Read Parquet row groups and verify timestamp coverage from the requested month start through the next month start.",
      ]),
    );
    expect(JSON.parse(await Bun.file(outputPath).text())).toEqual(
      expect.objectContaining({
        requestedMonth: "2026-03",
        coverage: expect.objectContaining({
          status: "full_month_candidate",
        }),
      }),
    );
  });

  test("keeps incomplete archive inventory as a partial candidate", async () => {
    const result = await checkBusObservatoryAvailability({
      year: 2026,
      month: 3,
      output: outputPath,
      fetcher: fixtureFetcher(["2026-03-01", "2026-03-02"], []),
    });

    expect(result.coverage.status).toBe("partial_month_candidate");
    expect(result.coverage.candidateLabel).toBe("third_party_partial_month_candidate");
    expect(result.coverage.missingMonthFileDates).toContain("2026-03-31");
    expect(result.coverage.bridgeFilePresent).toBe(false);
  });
});
