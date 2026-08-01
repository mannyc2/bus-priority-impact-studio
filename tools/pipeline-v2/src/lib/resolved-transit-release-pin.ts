export const RESOLVED_TRANSIT_RELEASE_PIN = {
  releaseId: "resolved-pack-v1-production",
  asOfDate: "2026-07-27",
  githubReleaseUrl: "https://github.com/mannyc2/mta-wiki/releases/tag/resolved-pack-v1-production",
  tagObject: "eeb1a6ccc4d6b7ffcbfe2730c84e2d74eac67b84",
  tagTarget: "159b8e79c8feeb3a658d7f57790020b88df17edb",
  generatorCommit: "ae1fb7704f0d878075d41fc38ebac83d4665b44f",
  buildId: "6f904a0a4965f279aa91be738fe469f41d8a7bad078a43cef42c28ebb435717e",
  manifestVersion: 7,
  exportProfile: "resolved-pack-v1-production",
  releaseManifestSha256: "b4ebf56d6db88ae0c75d97ac2091ab15c97e2e8e72b1fee738db921d5d001617",
  archiveSha256: "5df8c07e182711aa5ba231137a6d1fa51fcf04ad02bad8ff4e4e6f9b0250582f",
  fullTreePartitionSha256: "a491a78e3c2cb80b4c5916dc63b90e8957fbc087053ced786784461c4627260d",
  publicFingerprint: "78c72dc79db465d64b39011c4246596d714c1eecd82e5d2a870209acf949bdce",
  finalPublicationReceiptId:
    "resolved-pack-v1-production-final-publication:1e46fe4a4f9299b6e73e5598813c1744299b810a08ab81ab6ce28ccb971025df",
  successorHandoffId:
    "resolved-pack-v1-production-successor-handoff:4cdf5b48b45c28db0f4f2bb712c50d70d0349f451ed088dc9bcdbd7039d4323c",
} as const;

export const RESOLVED_TRANSIT_PUBLIC_RESOURCE_PINS = [
  {
    path: "resolved-pack/public/manifest.json",
    bytes: 802,
    sha256: "9cf2be5cc61d74414b6720c4f3ac83d2092e3b8b40302dd941fd20c48b8e5d97",
    count: 1,
  },
  {
    path: "resolved-pack/public/public_intervention_episodes.jsonl",
    bytes: 92_104,
    sha256: "428a18e5a436f29a51b6d3c8d95b4d7314c2d29e57749f7cb5260079644ee275",
    count: 157,
  },
  {
    path: "resolved-pack/public/public_intervention_components.jsonl",
    bytes: 216_835,
    sha256: "facbfddc2053ba01fce817b21ae798c7947bfaca862e46932c9ce1673ac7c1e1",
    count: 343,
  },
  {
    path: "resolved-pack/public/public_intervention_placements.jsonl",
    bytes: 37_692,
    sha256: "dc03cb0023b05219402aecf73c6393dec252b7df01e7061bd6d6356bc69c52ef",
    count: 104,
  },
  {
    path: "resolved-pack/public/public_routes.jsonl",
    bytes: 18_609,
    sha256: "a35880cde4395fffaff877dd61d401e5d4edbb5f72a2f7daff74905df4338690",
    count: 170,
  },
  {
    path: "resolved-pack/public/public_treatment_families.jsonl",
    bytes: 996,
    sha256: "4231ed413140c76b67289f18de5f1973ee1659315100f3c212ee2c91e367752b",
    count: 10,
  },
  {
    path: "resolved-pack/public/public_route_intervention_index.jsonl",
    bytes: 83_823,
    sha256: "8337dbba5c2971781f68e38deecfa013e418c57c36b05528d1a8bb385ca2e9ba",
    count: 343,
  },
  {
    path: "resolved-pack/public/public_intervention_history.jsonl",
    bytes: 149_329,
    sha256: "b123c3c9b985e6371cb58485828c8a488390d2e45e4a7105c3e29ab02513a9aa",
    count: 447,
  },
  {
    path: "resolved-pack/public/public_current_footprint.jsonl",
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    count: 0,
  },
  {
    path: "resolved-pack/public/public_network_summary.json",
    bytes: 541,
    sha256: "81299264db9b209fa62e10b034b4296f82c6c3f259f4652c4bd8b6f1ea1d7cff",
    count: 1,
  },
  {
    path: "resolved-pack/public/public_sources.jsonl",
    bytes: 13_133,
    sha256: "7ccb23251ab61641d35a303bd143504db3d13e1e30da6749b00162070e8e6161",
    count: 54,
  },
] as const;

export const RESOLVED_TRANSIT_CONFORMANCE_RESOURCE_PINS = [
  {
    path: "resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl",
    sha256: "c5a29a4f404767fd79f6a05c9aeea604ca8bc40c9c293716b781edee15d394a0",
    count: 230,
  },
  {
    path: "resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json",
    sha256: "09259101de7632d787877bd856e5dc315b5848044bb86581a0b8f3d9c9d5172d",
    count: 1,
  },
  {
    path: "resolved-pack/operator/tracker-conformance/summary.json",
    sha256: "dddb6f68c338f3530902932e58c80907f2a66338a6309c42c4d6bc43335784ab",
    count: 1,
  },
  {
    path: "resolved-pack/operator/tracker-conformance/tracker-baseline.jsonl",
    sha256: "0bb7e1e84f31ff5e1dbd0f6e4cc17d71f52f522c96c41ef9912dbc941e05543a",
    count: 204,
  },
  {
    path: "resolved-pack/operator/tracker-conformance/tracker-route-surface.jsonl",
    sha256: "b248baa6eb1c80d9bacdfae1411cff5e2b323bfafd567df2d26240b8235ebc8b",
    count: 179,
  },
] as const;

export const RESOLVED_TRANSIT_CONFORMANCE_RECEIPT_ID =
  "plan-056-tracker-diff-acceptance:23fb25861fa011cf5637f53064e5ea13af248eb2f0a1004313b7d1826529b554" as const;

export const RESOLVED_TRANSIT_TARGET_COUNTS = {
  producerEpisodes: 157,
  components: 343,
  placements: 104,
  producerRouteKeys: 170,
  treatmentFamilies: 10,
  routeIndexRows: 343,
  historyRows: 447,
  currentFootprintRows: 0,
  sources: 54,
  trackerBaselineEpisodes: 204,
  useProducerIdentity: 131,
  trackerEnrichmentOnly: 65,
  dropLegacyEpisode: 8,
  addProducerEpisode: 26,
  candidateEpisodes: 222,
  candidateRouteArtifacts: 188,
  candidateEpisodeRouteMemberships: 268,
  componentActions: {
    add: 104,
    modify: 109,
    remove: 117,
    suspend: 0,
    resume: 7,
    retain: 1,
    unknown: 5,
  },
  componentExtents: {
    route_wide: 34,
    bounded_segment: 8,
    stop_set: 0,
    service_pattern: 163,
    unknown: 138,
  },
  placementStates: {
    confirmed_active: 0,
    last_confirmed_active: 95,
    confirmed_inactive: 0,
    planned: 0,
    suspended: 0,
    conflicted: 0,
    unknown: 9,
  },
} as const;
