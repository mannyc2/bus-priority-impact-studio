console.error(
  [
    "sources:probe is intentionally not implemented in the repo-basics scaffold.",
    "Next step: implement one fixture-backed Socrata adapter in packages/sources,",
    "then add a live-probe command that writes knowledge/raw/metadata/*.json.",
  ].join(" "),
);
process.exit(1);
