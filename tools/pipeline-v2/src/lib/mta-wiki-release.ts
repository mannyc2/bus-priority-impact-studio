import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { Effect, Schema } from "effect";

const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));

export const MtaWikiReleaseVerificationErrorCodeSchema = Schema.Literals([
  "invalid_input",
  "unsafe_path",
  "read_failed",
  "hash_mismatch",
  "byte_count_mismatch",
  "invalid_utf8",
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
