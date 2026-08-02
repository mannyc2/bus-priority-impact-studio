import { createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalServingJson, canonicalServingJsonBytes } from "@bp/domain/studio/serving-release";

export type BackfillPartition = {
  readonly datasetId: string;
  readonly sourceId: string;
  readonly partition: string;
  readonly queryFingerprint: string;
};

export type BackfillPartitionReceipt = BackfillPartition & {
  readonly artifactKind: "bp.pipeline.logical_dataset_partition_receipt.v1";
  readonly schemaVersion: 1;
  readonly snapshotSha256: string;
  readonly snapshotBytes: number;
  readonly rowCount: number;
};

export type BackfillPartitionResult = {
  readonly receipt: BackfillPartitionReceipt;
  readonly outcome: "captured" | "verified_skip";
  readonly snapshotPath: string;
  readonly receiptPath: string;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._:-]+$/u.test(value)) throw new Error(`Unsafe ${label}: ${value}.`);
  return value;
}

function partitionPaths(root: string, partition: BackfillPartition) {
  const datasetId = safeSegment(partition.datasetId, "dataset ID");
  const sourceId = safeSegment(partition.sourceId, "source ID");
  const partitionId = safeSegment(partition.partition, "partition ID");
  const directory = join(root, datasetId, sourceId);
  return {
    directory,
    snapshotPath: join(directory, `${partitionId}.rows.json`),
    receiptPath: join(directory, `${partitionId}.receipt.json`),
  };
}

async function readVerifiedReceipt(
  expected: BackfillPartition,
  snapshotPath: string,
  receiptPath: string,
): Promise<BackfillPartitionReceipt | null> {
  const snapshot = Bun.file(snapshotPath);
  const receiptFile = Bun.file(receiptPath);
  if (!(await snapshot.exists()) || !(await receiptFile.exists())) return null;
  try {
    const receipt = (await receiptFile.json()) as BackfillPartitionReceipt;
    const bytes = new Uint8Array(await snapshot.arrayBuffer());
    if (
      receipt.artifactKind !== "bp.pipeline.logical_dataset_partition_receipt.v1" ||
      receipt.schemaVersion !== 1 ||
      receipt.datasetId !== expected.datasetId ||
      receipt.sourceId !== expected.sourceId ||
      receipt.partition !== expected.partition ||
      receipt.queryFingerprint !== expected.queryFingerprint ||
      receipt.snapshotBytes !== bytes.byteLength ||
      receipt.snapshotSha256 !== sha256(bytes)
    ) {
      return null;
    }
    const rows: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(rows) || rows.length !== receipt.rowCount) return null;
    return receipt;
  } catch {
    return null;
  }
}

/** Capture one complete partition, or skip it only after verifying exact prior bytes. */
export async function backfillLogicalDatasetPartition(input: {
  readonly root: string;
  readonly partition: BackfillPartition;
  readonly fetchRows: () => Promise<readonly unknown[]>;
}): Promise<BackfillPartitionResult> {
  const paths = partitionPaths(input.root, input.partition);
  const existing = await readVerifiedReceipt(
    input.partition,
    paths.snapshotPath,
    paths.receiptPath,
  );
  if (existing !== null) {
    return { receipt: existing, outcome: "verified_skip", ...paths };
  }

  const rows = await input.fetchRows();
  const snapshotBytes = canonicalServingJsonBytes(rows);
  const receipt: BackfillPartitionReceipt = {
    artifactKind: "bp.pipeline.logical_dataset_partition_receipt.v1",
    schemaVersion: 1,
    ...input.partition,
    snapshotSha256: sha256(snapshotBytes),
    snapshotBytes: snapshotBytes.byteLength,
    rowCount: rows.length,
  };
  const receiptBytes = new TextEncoder().encode(`${canonicalServingJson(receipt)}\n`);
  await mkdir(paths.directory, { recursive: true });
  const nonce = crypto.randomUUID();
  const snapshotPartial = `${paths.snapshotPath}.${nonce}.partial`;
  const receiptPartial = `${paths.receiptPath}.${nonce}.partial`;
  try {
    await Bun.write(snapshotPartial, snapshotBytes);
    await Bun.write(receiptPartial, receiptBytes);
    await rename(snapshotPartial, paths.snapshotPath);
    await rename(receiptPartial, paths.receiptPath);
  } finally {
    await Promise.all([rm(snapshotPartial, { force: true }), rm(receiptPartial, { force: true })]);
  }
  const verified = await readVerifiedReceipt(
    input.partition,
    paths.snapshotPath,
    paths.receiptPath,
  );
  if (verified === null)
    throw new Error(`Backfill receipt verification failed for ${input.partition.partition}.`);
  return { receipt: verified, outcome: "captured", ...paths };
}

export async function readBackfillPartitionRows(
  result: BackfillPartitionResult,
): Promise<unknown[]> {
  const rows: unknown = await Bun.file(result.snapshotPath).json();
  if (!Array.isArray(rows) || rows.length !== result.receipt.rowCount) {
    throw new Error(`Backfill partition ${result.receipt.partition} is no longer complete.`);
  }
  return rows;
}
