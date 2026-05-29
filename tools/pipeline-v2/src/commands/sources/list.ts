import { defineCommand, z } from "@liche/core";
import { parseSourceManifest } from "@bp/sources";
import { fromRepoRoot } from "../../lib/paths.ts";

export default defineCommand({
  path: ["sources", "list"],
  summary: "List source ids from the manifest",
  input: { options: z.object({}) },
  output: z.object({ sources: z.array(z.string()) }),
  async run() {
    const text = await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text();
    const manifest = parseSourceManifest(text);
    return { sources: manifest.sources.map((s) => s.id) };
  },
});
