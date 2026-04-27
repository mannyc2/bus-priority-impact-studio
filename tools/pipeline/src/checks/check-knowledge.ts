const requiredFiles = [
  "knowledge/index.md",
  "knowledge/log.md",
  "knowledge/raw/source_manifest.yaml",
];

const missing: string[] = [];

for (const path of requiredFiles) {
  if (!(await Bun.file(path).exists())) {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error(`Missing required knowledge files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`knowledge check passed (${requiredFiles.length} required files)`);
