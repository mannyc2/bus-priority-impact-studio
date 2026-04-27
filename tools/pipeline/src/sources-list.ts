const manifestPath = "knowledge/raw/source_manifest.yaml";
const manifest = await Bun.file(manifestPath).text();
const ids = [...manifest.matchAll(/^\s*id:\s*([a-z0-9_.-]+)\s*$/gim)]
  .map((match) => match[1])
  .filter((id): id is string => id !== undefined);

if (ids.length === 0) {
  console.error(`No source ids found in ${manifestPath}`);
  process.exit(1);
}

for (const id of ids) {
  console.log(id);
}
