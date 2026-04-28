import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fromRepoRoot } from "../source-manifest.js";
import { writeJson } from "./json.js";

export const routeSliceArtifactNames = [
  "summary.json",
  "hotspots.json",
  "ridership-profile.json",
  "speed-profile.json",
  "intervention-overlay.json",
  "bus-lane-overlay.json",
  "schedule-comparison.json",
  "route-scorecard.json",
  "route-brief-input.json",
] as const;

export type RouteSliceArtifactName = (typeof routeSliceArtifactNames)[number];

export function routeSliceKey(routeId: string, month: string): string {
  return `${routeId.toLowerCase()}-${month}`;
}

export function routeSliceArtifactKey(
  routeId: string,
  month: string,
  artifactName: RouteSliceArtifactName,
): string {
  return `route-slices/${routeSliceKey(routeId, month)}/${artifactName}`;
}

export function routeSliceArtifactPath(
  routeId: string,
  month: string,
  artifactName: RouteSliceArtifactName,
): string {
  return fromRepoRoot(join("data/artifacts", routeSliceArtifactKey(routeId, month, artifactName)));
}

export async function writeRouteSliceArtifact(
  routeId: string,
  month: string,
  artifactName: RouteSliceArtifactName,
  artifact: unknown,
): Promise<string> {
  const path = routeSliceArtifactPath(routeId, month, artifactName);
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, artifact);

  return path;
}

export async function fileDigest(path: string): Promise<{ byteLength: number; sha256: string }> {
  const bytes = Buffer.from(await Bun.file(path).arrayBuffer());

  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
