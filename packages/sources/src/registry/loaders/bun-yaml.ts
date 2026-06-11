import { parseSourceManifestObject, type SourceManifest } from "../manifest.js";

export function loadSourceManifestYaml(text: string): SourceManifest {
  return parseSourceManifestObject(Bun.YAML.parse(text));
}
