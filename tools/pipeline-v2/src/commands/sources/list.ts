import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { fromRepoRoot } from "../../lib/paths.ts";

export default defineCommand({
  path: ["sources", "list"],
  summary: "List source ids from the manifest",
  input: { options: Schema.Struct({}) },
  output: Schema.Struct({ sources: Schema.Array(Schema.String) }),
  async run() {
    const text = await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text();
    const manifest = loadSourceManifestYaml(text);
    return { sources: manifest.sources.map((s) => s.id) };
  },
});
