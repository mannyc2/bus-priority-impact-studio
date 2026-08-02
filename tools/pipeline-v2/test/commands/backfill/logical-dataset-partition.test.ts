import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backfillLogicalDatasetPartition,
  readBackfillPartitionRows,
} from "../../../src/lib/logical-dataset-backfill.ts";
import { collapseMissingMonthPartitions } from "../../../src/commands/backfill/full-history.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bp-logical-backfill-"));
  roots.push(root);
  return root;
}

const partition = {
  datasetId: "route-ridership",
  sourceId: "bus_hourly_ridership_2020_2024",
  partition: "2020-01",
  queryFingerprint: "sha256:fixture-query-v1",
} as const;

describe("logical dataset partition backfill", () => {
  test("collapses missing middle partitions without claiming continuity", () => {
    expect(collapseMissingMonthPartitions(["2020-03", "2020-04", "2020-07"])).toEqual([
      { start: "2020-03", end: "2020-04" },
      { start: "2020-07", end: "2020-07" },
    ]);
  });

  test("verified restart skips the network and preserves exact bytes", async () => {
    const root = await fixtureRoot();
    let fetchCount = 0;
    const fetchRows = async () => {
      fetchCount += 1;
      return [{ routeId: "B1", ridership: 42 }, { routeId: "B2", ridership: 7 }];
    };

    const first = await backfillLogicalDatasetPartition({ root, partition, fetchRows });
    const firstBytes = await Bun.file(first.snapshotPath).bytes();
    const second = await backfillLogicalDatasetPartition({ root, partition, fetchRows });

    expect(first.outcome).toBe("captured");
    expect(second.outcome).toBe("verified_skip");
    expect(fetchCount).toBe(1);
    expect(await Bun.file(second.snapshotPath).bytes()).toEqual(firstBytes);
    expect(await readBackfillPartitionRows(second)).toHaveLength(2);
  });

  test("a partial file never counts as a complete partition", async () => {
    const root = await fixtureRoot();
    const partialDirectory = join(
      root,
      partition.datasetId,
      partition.sourceId,
    );
    await mkdir(partialDirectory, { recursive: true });
    await Bun.write(join(partialDirectory, `${partition.partition}.rows.json.partial`), "partial");
    let fetchCount = 0;
    const result = await backfillLogicalDatasetPartition({
      root,
      partition,
      fetchRows: async () => {
        fetchCount += 1;
        return [{ routeId: "B1", ridership: 1 }];
      },
    });

    expect(result.outcome).toBe("captured");
    expect(fetchCount).toBe(1);
    expect(result.receipt.rowCount).toBe(1);
  });
});
