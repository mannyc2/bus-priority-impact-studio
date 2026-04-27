import type { SourceManifest } from "@bp/sources";
import { parseSourceManifest } from "@bp/sources";

export type { ManifestSource, SocrataManifestSource, SourceManifest } from "@bp/sources";
export { ManifestSourceSchema, parseSourceManifest, SourceManifestSchema } from "@bp/sources";
export { fromRepoRoot, repoRootPath } from "./lib/paths.js";

import { fromRepoRoot } from "./lib/paths.js";

export const manifestPath = fromRepoRoot("knowledge/raw/source_manifest.yaml");

export async function readSourceManifest(path = manifestPath): Promise<SourceManifest> {
  return parseSourceManifest(await Bun.file(path).text());
}
