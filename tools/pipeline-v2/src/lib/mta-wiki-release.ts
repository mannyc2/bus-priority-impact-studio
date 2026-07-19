import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { Effect, Schema } from "effect";
import { decodeSchemaStrict } from "./schema-decode.ts";

const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const SafeReleaseIdSchema = NonEmptyStringSchema.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
);

const ReleaseStatusIndexEntryV1Schema = Schema.Struct({
  release_id: SafeReleaseIdSchema,
  path: NonEmptyStringSchema,
  status: Schema.Literal("quarantined"),
});
const ReleaseStatusIndexEntryV2Schema = Schema.Struct({
  ...ReleaseStatusIndexEntryV1Schema.fields,
  record_schema_version: Schema.Literals([1, 2]),
});
const ReleaseStatusIndexSchema = Schema.Union([
  Schema.Struct({
    schema_version: Schema.Literal(1),
    records: Schema.Array(ReleaseStatusIndexEntryV1Schema),
  }),
  Schema.Struct({
    schema_version: Schema.Literal(2),
    records: Schema.Array(ReleaseStatusIndexEntryV2Schema),
  }),
]);
const ReleaseStatusArtifactV1Schema = Schema.Struct({
  path: NonEmptyStringSchema,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
  contract: NonEmptyStringSchema,
  declared_version: PositiveIntegerSchema,
  decoder_error: NonEmptyStringSchema,
});
const ReleaseStatusArtifactV2Schema = Schema.Struct({
  path: NonEmptyStringSchema,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
  declared_contract_version: Schema.NullOr(PositiveIntegerSchema),
  detected_by_contract: NonEmptyStringSchema,
  detected_by_contract_version: PositiveIntegerSchema,
  verifier_error: NonEmptyStringSchema,
});
const ReleaseStatusRecordV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  release_id: SafeReleaseIdSchema,
  release_path: NonEmptyStringSchema,
  status: Schema.Literal("quarantined"),
  discovered_at: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
  reason_code: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
  manifest_sha256: Sha256Schema,
  failing_artifact: ReleaseStatusArtifactV1Schema,
  affected_identity: Schema.Struct({
    decision_id: NonEmptyStringSchema,
    occurrence_id: NonEmptyStringSchema,
    relation_id: NonEmptyStringSchema,
  }),
  replacement_release_id: Schema.NullOr(SafeReleaseIdSchema),
});
const ReleaseStatusRecordV2Schema = Schema.Struct({
  schema_version: Schema.Literal(2),
  release_id: SafeReleaseIdSchema,
  release_path: NonEmptyStringSchema,
  status: Schema.Literal("quarantined"),
  discovered_at: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
  reason_code: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
  manifest_sha256: Sha256Schema,
  failing_artifact: ReleaseStatusArtifactV2Schema,
  affected_identities: Schema.Array(
    Schema.Struct({
      identity_type: Schema.Literal("route"),
      gtfs_route_id: NonEmptyStringSchema,
      route_record_id: Schema.NullOr(NonEmptyStringSchema),
      route_family_id: NonEmptyStringSchema,
    }),
  ),
  replacement_release_id: Schema.NullOr(SafeReleaseIdSchema),
});
const ReleaseStatusRecordSchema = Schema.Union([
  ReleaseStatusRecordV1Schema,
  ReleaseStatusRecordV2Schema,
]);

export type MtaWikiReleaseQuarantineStatus = {
  readonly recordSchemaVersion: 1 | 2;
  readonly reasonCode: string;
  readonly reason: string;
  readonly manifestSha256: string;
};

export const MtaWikiReleaseVerificationErrorCodeSchema = Schema.Literals([
  "invalid_input",
  "unsafe_path",
  "read_failed",
  "hash_mismatch",
  "byte_count_mismatch",
  "invalid_utf8",
  "invalid_json",
  "schema_mismatch",
  "missing_manifest_file",
]);
export type MtaWikiReleaseVerificationErrorCode =
  typeof MtaWikiReleaseVerificationErrorCodeSchema.Type;

export class MtaWikiReleaseVerificationError extends Schema.TaggedErrorClass<MtaWikiReleaseVerificationError>()(
  "MtaWikiReleaseVerificationError",
  {
    code: MtaWikiReleaseVerificationErrorCodeSchema,
    operation: Schema.String,
    path: Schema.String,
    line: Schema.NullOr(PositiveIntegerSchema),
    detail: Schema.String,
  },
) {}

export type MtaWikiReleaseFileMetadata = {
  readonly bytes: number;
  readonly sha256: string;
};

export type VerifiedMtaWikiReleaseFile = {
  readonly pointer: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly metadata: MtaWikiReleaseFileMetadata;
};

export type ResolvedMtaWikiRelease = {
  readonly releaseDirectory: string;
  readonly canonicalReleaseDirectory: string;
  readonly outputPath: string;
};

function verificationError(input: {
  code: MtaWikiReleaseVerificationErrorCode;
  operation: string;
  path: string;
  detail: string;
  line?: number | null | undefined;
}): MtaWikiReleaseVerificationError {
  return MtaWikiReleaseVerificationError.make({ ...input, line: input.line ?? null });
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isPathInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

/**
 * Release manifests use portable POSIX-style relative paths. Validate the
 * lexical form before resolving or reading any manifest-addressed file so a
 * manifest cannot rely on platform-specific path interpretation.
 */
export function isSafeMtaWikiReleaseRelativePath(value: string): boolean {
  if (
    value.trim().length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/u.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export const readMtaWikiReleaseBytes = Effect.fn("MtaWikiRelease.readBytes")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => readFile(path),
    catch: (cause) =>
      verificationError({ code: "read_failed", operation, path, detail: String(cause) }),
  });
});

const canonicalPath = Effect.fn("MtaWikiRelease.canonicalPath")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => realpath(path),
    catch: (cause) =>
      verificationError({ code: "read_failed", operation, path, detail: String(cause) }),
  });
});

function isMissingPathError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

const canonicalProspectivePath = Effect.fn("MtaWikiRelease.canonicalProspectivePath")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const target = resolve(path);
      let ancestor = target;
      while (true) {
        try {
          const canonicalAncestor = await realpath(ancestor);
          return resolve(canonicalAncestor, relative(ancestor, target));
        } catch (cause) {
          if (!isMissingPathError(cause)) throw cause;
          const parent = dirname(ancestor);
          if (parent === ancestor) throw cause;
          ancestor = parent;
        }
      }
    },
    catch: (cause) =>
      verificationError({ code: "read_failed", operation, path, detail: String(cause) }),
  });
});

export const resolveMtaWikiRelease = Effect.fn("MtaWikiRelease.resolveRelease")(function* (input: {
  mtaWikiRoot: string;
  wikiRelease: string;
  wikiManifestSha256: string;
  output: string;
}) {
  const operation = "resolveReleaseDirectory";
  if (
    input.mtaWikiRoot.trim().length === 0 ||
    input.wikiRelease.trim().length === 0 ||
    input.output.trim().length === 0
  ) {
    return yield* verificationError({
      code: "invalid_input",
      operation,
      path: input.mtaWikiRoot,
      detail: "mtaWikiRoot, wikiRelease, and output must be non-empty",
    });
  }
  if (!/^[a-f0-9]{64}$/u.test(input.wikiManifestSha256)) {
    return yield* verificationError({
      code: "invalid_input",
      operation,
      path: input.mtaWikiRoot,
      detail: "wikiManifestSha256 must be a lowercase 64-character SHA-256 digest",
    });
  }

  const releasesRoot = resolve(input.mtaWikiRoot, "data", "exports", "releases");
  const releaseDirectory = resolve(releasesRoot, input.wikiRelease);
  if (!isPathInside(releasesRoot, releaseDirectory)) {
    return yield* verificationError({
      code: "unsafe_path",
      operation,
      path: releaseDirectory,
      detail: "wikiRelease escapes the MTA Wiki releases directory",
    });
  }
  const releaseStat = yield* Effect.tryPromise({
    try: () => lstat(releaseDirectory),
    catch: (cause) =>
      verificationError({
        code: "read_failed",
        operation,
        path: releaseDirectory,
        detail: String(cause),
      }),
  });
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) {
    return yield* verificationError({
      code: "unsafe_path",
      operation,
      path: releaseDirectory,
      detail: "wikiRelease must name a regular non-symlink release directory",
    });
  }
  const canonicalReleasesRoot = yield* canonicalPath(releasesRoot, operation);
  const canonicalReleaseDirectory = yield* canonicalPath(releaseDirectory, operation);
  if (!isPathInside(canonicalReleasesRoot, canonicalReleaseDirectory)) {
    return yield* verificationError({
      code: "unsafe_path",
      operation,
      path: canonicalReleaseDirectory,
      detail: "wikiRelease resolves outside the MTA Wiki releases directory",
    });
  }

  const outputPath = resolve(input.output);
  if (outputPath === releaseDirectory || isPathInside(releaseDirectory, outputPath)) {
    return yield* verificationError({
      code: "unsafe_path",
      operation,
      path: outputPath,
      detail: "output must not overwrite files in the pinned MTA Wiki release",
    });
  }
  const canonicalOutputPath = yield* canonicalProspectivePath(outputPath, operation);
  if (
    canonicalOutputPath === canonicalReleaseDirectory ||
    isPathInside(canonicalReleaseDirectory, canonicalOutputPath)
  ) {
    return yield* verificationError({
      code: "unsafe_path",
      operation,
      path: canonicalOutputPath,
      detail: "output resolves inside the pinned MTA Wiki release",
    });
  }
  return { releaseDirectory, canonicalReleaseDirectory, outputPath };
});

export const safeMtaWikiReleaseFilePath = Effect.fn("MtaWikiRelease.safeFilePath")(
  function* (input: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
    pointer: string;
    operation: string;
  }) {
    const target = resolve(input.releaseDirectory, input.pointer);
    if (!isPathInside(input.releaseDirectory, target)) {
      return yield* verificationError({
        code: "unsafe_path",
        operation: input.operation,
        path: target,
        detail: `release pointer escapes its release directory: ${input.pointer}`,
      });
    }
    const targetComponents = relative(input.releaseDirectory, target).split(sep);
    let current = input.releaseDirectory;
    for (const [index, component] of targetComponents.entries()) {
      current = resolve(current, component);
      const stat = yield* Effect.tryPromise({
        try: () => lstat(current),
        catch: (cause) =>
          verificationError({
            code: "read_failed",
            operation: input.operation,
            path: current,
            detail: String(cause),
          }),
      });
      const isLeaf = index === targetComponents.length - 1;
      if (stat.isSymbolicLink() || (isLeaf ? !stat.isFile() : !stat.isDirectory())) {
        return yield* verificationError({
          code: "unsafe_path",
          operation: input.operation,
          path: current,
          detail: `release pointer must traverse only regular directories and end at a regular non-symlink file: ${input.pointer}`,
        });
      }
    }
    const canonicalTarget = yield* canonicalPath(target, input.operation);
    if (!isPathInside(input.canonicalReleaseDirectory, canonicalTarget)) {
      return yield* verificationError({
        code: "unsafe_path",
        operation: input.operation,
        path: canonicalTarget,
        detail: `release pointer resolves outside its release directory: ${input.pointer}`,
      });
    }
    return canonicalTarget;
  },
);

function stringsAreSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value)
  );
}

function isValidIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function expectedRouteFamilyId(gtfsRouteId: string): string {
  return gtfsRouteId.endsWith("+") ? gtfsRouteId.slice(0, -1) : gtfsRouteId;
}

/**
 * Read the versioned producer quarantine index outside the immutable release
 * directory. A missing index means that no quarantine mechanism is present;
 * once present, malformed, unsafe, or contradictory status bytes fail closed.
 */
export const readMtaWikiReleaseQuarantineStatus = Effect.fn("MtaWikiRelease.readQuarantineStatus")(
  function* (input: { mtaWikiRoot: string; wikiRelease: string; wikiManifestSha256: string }) {
    const operation = "readReleaseQuarantineStatus";
    if (
      input.mtaWikiRoot.trim().length === 0 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(input.wikiRelease) ||
      !/^[a-f0-9]{64}$/u.test(input.wikiManifestSha256)
    ) {
      return yield* verificationError({
        code: "invalid_input",
        operation,
        path: input.mtaWikiRoot,
        detail: "mtaWikiRoot, a safe wikiRelease, and a lowercase SHA-256 digest are required",
      });
    }

    const root = resolve(input.mtaWikiRoot);
    const indexPointer = "data/exports/release-status/index.json";
    const indexPath = resolve(root, indexPointer);
    const indexStat = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await lstat(indexPath);
        } catch (cause) {
          if (isMissingPathError(cause)) return null;
          throw cause;
        }
      },
      catch: (cause) =>
        verificationError({
          code: "read_failed",
          operation,
          path: indexPath,
          detail: String(cause),
        }),
    });
    if (indexStat === null) return null;
    if (!indexStat.isFile() || indexStat.isSymbolicLink()) {
      return yield* verificationError({
        code: "unsafe_path",
        operation,
        path: indexPath,
        detail: "release-status index must be a regular non-symlink file",
      });
    }

    const canonicalRoot = yield* canonicalPath(root, operation);
    const safeIndexPath = yield* safeMtaWikiReleaseFilePath({
      releaseDirectory: root,
      canonicalReleaseDirectory: canonicalRoot,
      pointer: indexPointer,
      operation,
    });
    const indexBytes = yield* readMtaWikiReleaseBytes(safeIndexPath, operation);
    const indexText = yield* decodeMtaWikiReleaseUtf8(indexBytes, {
      operation,
      path: safeIndexPath,
    });
    const indexValue = yield* Effect.try({
      try: () => JSON.parse(indexText) as unknown,
      catch: (cause) =>
        verificationError({
          code: "invalid_json",
          operation,
          path: safeIndexPath,
          detail: String(cause),
        }),
    });
    const index = yield* Effect.try({
      try: () => decodeSchemaStrict(ReleaseStatusIndexSchema, indexValue),
      catch: (cause) =>
        verificationError({
          code: "schema_mismatch",
          operation,
          path: safeIndexPath,
          detail: String(cause),
        }),
    });
    const indexedReleaseIds = index.records.map((entry) => entry.release_id);
    if (!stringsAreSortedUnique(indexedReleaseIds)) {
      return yield* verificationError({
        code: "schema_mismatch",
        operation,
        path: safeIndexPath,
        detail: "release-status index records must be sorted and unique by release_id",
      });
    }
    if (new Set(index.records.map((entry) => entry.path)).size !== index.records.length) {
      return yield* verificationError({
        code: "schema_mismatch",
        operation,
        path: safeIndexPath,
        detail: "release-status index record paths must be unique",
      });
    }
    const entry = index.records.find((candidate) => candidate.release_id === input.wikiRelease);
    if (entry === undefined) return null;
    if (
      !isSafeMtaWikiReleaseRelativePath(entry.path) ||
      !entry.path.startsWith("data/exports/release-status/")
    ) {
      return yield* verificationError({
        code: "unsafe_path",
        operation,
        path: entry.path,
        detail: "release-status record path must stay inside data/exports/release-status",
      });
    }

    const recordPath = yield* safeMtaWikiReleaseFilePath({
      releaseDirectory: root,
      canonicalReleaseDirectory: canonicalRoot,
      pointer: entry.path,
      operation,
    });
    const recordBytes = yield* readMtaWikiReleaseBytes(recordPath, operation);
    const recordText = yield* decodeMtaWikiReleaseUtf8(recordBytes, {
      operation,
      path: recordPath,
    });
    const recordValue = yield* Effect.try({
      try: () => JSON.parse(recordText) as unknown,
      catch: (cause) =>
        verificationError({
          code: "invalid_json",
          operation,
          path: recordPath,
          detail: String(cause),
        }),
    });
    const record = yield* Effect.try({
      try: () => decodeSchemaStrict(ReleaseStatusRecordSchema, recordValue),
      catch: (cause) =>
        verificationError({
          code: "schema_mismatch",
          operation,
          path: recordPath,
          detail: String(cause),
        }),
    });
    if (
      record.release_id !== input.wikiRelease ||
      record.status !== entry.status ||
      record.release_path !== `data/exports/releases/${input.wikiRelease}` ||
      record.manifest_sha256 !== input.wikiManifestSha256 ||
      !isValidIsoDate(record.discovered_at) ||
      record.replacement_release_id === input.wikiRelease ||
      !isSafeMtaWikiReleaseRelativePath(record.failing_artifact.path)
    ) {
      return yield* verificationError({
        code: "schema_mismatch",
        operation,
        path: recordPath,
        detail:
          "release-status record does not match its index entry, release, manifest, or invariants",
      });
    }
    if (
      index.schema_version === 2 &&
      "record_schema_version" in entry &&
      entry.record_schema_version !== record.schema_version
    ) {
      return yield* verificationError({
        code: "schema_mismatch",
        operation,
        path: recordPath,
        detail: "release-status record schema version does not match its index entry",
      });
    }
    if (record.schema_version === 2) {
      const routeIds = record.affected_identities.map((identity) => identity.gtfs_route_id);
      if (
        routeIds.length === 0 ||
        !stringsAreSortedUnique(routeIds) ||
        record.affected_identities.some(
          (identity) => identity.route_family_id !== expectedRouteFamilyId(identity.gtfs_route_id),
        )
      ) {
        return yield* verificationError({
          code: "schema_mismatch",
          operation,
          path: recordPath,
          detail:
            "release-status v2 affected route identities must be non-empty, sorted, unique, and family-consistent",
        });
      }
    }
    return {
      recordSchemaVersion: record.schema_version,
      reasonCode: record.reason_code,
      reason: record.reason,
      manifestSha256: record.manifest_sha256,
    } satisfies MtaWikiReleaseQuarantineStatus;
  },
);

export const verifyMtaWikiReleaseFile = Effect.fn("MtaWikiRelease.verifyFile")(function* (input: {
  releaseDirectory: string;
  canonicalReleaseDirectory: string;
  pointer: string;
  metadata: MtaWikiReleaseFileMetadata;
  operation: string;
}) {
  const path = yield* safeMtaWikiReleaseFilePath(input);
  const bytes = yield* readMtaWikiReleaseBytes(path, input.operation);
  if (bytes.length !== input.metadata.bytes) {
    return yield* verificationError({
      code: "byte_count_mismatch",
      operation: input.operation,
      path,
      detail: `expected ${input.metadata.bytes} bytes, received ${bytes.length}`,
    });
  }
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== input.metadata.sha256) {
    return yield* verificationError({
      code: "hash_mismatch",
      operation: input.operation,
      path,
      detail: `expected ${input.metadata.sha256}, received ${actualSha256}`,
    });
  }
  return { pointer: input.pointer, path, bytes, metadata: input.metadata };
});

export function decodeMtaWikiReleaseUtf8(
  bytes: Uint8Array,
  input: { operation: string; path: string },
): Effect.Effect<string, MtaWikiReleaseVerificationError> {
  return Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: (cause) =>
      verificationError({
        code: "invalid_utf8",
        operation: input.operation,
        path: input.path,
        detail: String(cause),
      }),
  });
}
