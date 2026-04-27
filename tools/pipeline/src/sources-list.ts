import { manifestPath, readSourceManifest } from "./source-manifest.js";

const manifest = await readSourceManifest();

if (manifest.sources.length === 0) {
  console.error(`No source ids found in ${manifestPath}`);
  process.exit(1);
}

for (const source of manifest.sources) {
  console.log(source.id);
}
