import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  SOURCE_GAP_DETECTOR_ID,
} from "@bp/analytics";
import {
  type FindingDetectorSpec,
  FindingDetectorSpecSchema,
  type FindingDetectorSpecsArtifact,
  FindingDetectorSpecsArtifactSchema,
  type FindingDetectorSpecTemplate,
} from "@bp/domain";
import { writeJson } from "../../lib/json.js";

export const DETECTOR_SPEC_TEMPLATE: FindingDetectorSpecTemplate = {
  requiredFields: [
    "detectorId",
    "question",
    "claimTemplate",
    "allowedClaimStrength",
    "primaryEvidenceRequired",
    "supportingEvidenceExpected",
    "counterEvidenceRequired",
    "promotionChecklist",
    "knownFailureModes",
  ],
  template: {
    detectorId: "Stable snake_case detector id.",
    question: "Specific question the detector is allowed to answer.",
    claimTemplate: "Strongest safe claim text pattern before reviewer promotion.",
    allowedClaimStrength: "0-5 ceiling where 0 is data-quality only and 5 is publication-grade.",
    primaryEvidenceRequired: "Evidence that must directly support the detector question.",
    supportingEvidenceExpected: "Corroborating context expected in a complete packet.",
    counterEvidenceRequired: "Evidence or caveats that would weaken, scope, or block the claim.",
    promotionChecklist: "Reviewer checks that must pass before promotion.",
    knownFailureModes: "Common ways this detector can overclaim or mislead.",
  },
};

const DETECTOR_SPEC_ROWS = [
  {
    detectorId: SOURCE_GAP_DETECTOR_ID,
    name: "Source gap",
    question: "Which route/source scopes are missing required data or join coverage?",
    claimTemplate:
      "A source needed for stronger service claims is missing, stale, or failed to join.",
    allowedClaimStrength: 1,
    primaryEvidenceRequired: [
      "Missing-data or coverage-audit evidence with expected vs observed inputs.",
    ],
    supportingEvidenceExpected: [
      "Source freshness policy, join counts, and affected route/source scope.",
    ],
    counterEvidenceRequired: [
      "A newer source capture, alternate source, or route-specific evidence that resolves the gap.",
    ],
    promotionChecklist: [
      "Keep as data quality unless independent service evidence exists.",
      "Verify the source was expected for this month and route/source scope.",
      "Check whether a rerun or newer source capture clears the gap.",
    ],
    knownFailureModes: [
      "Treating missing data as proof of no problem.",
      "Treating a source lag warning as a service-performance claim.",
    ],
  },
  {
    detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
    name: "Persistent speed hotspot",
    question: "Which route segments have persistently slow speed evidence?",
    claimTemplate: "A specific segment on the route has a persistent low-speed hotspot.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "Segment speed, slow-window share, observation count, bus-trip count, and hotspot score.",
    ],
    supportingEvidenceExpected: ["Ridership exposure and any route-month context evidence."],
    counterEvidenceRequired: [
      "Scope evidence showing how much of the route is represented by the segment hit.",
    ],
    promotionChecklist: [
      "Keep the claim segment-scoped unless route-wide evidence also supports it.",
      "Inspect raw speed, trip, and observation support before relying on hotspot score.",
      "Check geometry and stop names for implausible segment placement.",
    ],
    knownFailureModes: [
      "Promoting one segment hit into a whole-route diagnosis.",
      "Relying on derived hotspot score without raw speed support.",
    ],
  },
  {
    detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
    name: "Observed reliability",
    question:
      "Which routes show observed headway reliability risk corroborated by wait assessment?",
    claimTemplate: "The route shows observed long-gap/wait reliability risk for the release month.",
    allowedClaimStrength: 3,
    primaryEvidenceRequired: [
      "GTFS-RT sample count, observed long-gap share, wait reliability ratio, and Bus Wait Assessment.",
    ],
    supportingEvidenceExpected: [
      "Scheduled baseline sample support and route-month context evidence.",
    ],
    counterEvidenceRequired: [
      "Run/window/sample limitations and any official schedule or service-alert context that explains gaps.",
    ],
    promotionChecklist: [
      "Confirm GTFS-RT run coverage and scheduled baseline support.",
      "Avoid causal claims; reliability risk is observed, not explained by this detector alone.",
      "Check whether risk is route-wide, directional, or time-window specific.",
    ],
    knownFailureModes: [
      "Confusing observed unreliability with a diagnosis of why it happened.",
      "Ignoring low sample support or missing scheduled baseline context.",
    ],
  },
  {
    detectorId: INTERVENTION_GAP_DETECTOR_ID,
    name: "Intervention gap",
    question: "Which high-pain routes lack dated or evaluated intervention evidence?",
    claimTemplate:
      "A route with high speed/reliability pain has absent or thin intervention evidence.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Underlying speed or reliability evidence plus intervention inventory status.",
    ],
    supportingEvidenceExpected: [
      "Route context, bus-lane/ACE/source inventory, and source-gap evidence.",
    ],
    counterEvidenceRequired: [
      "Future interventions, undated interventions, or source gaps that could hide a treatment.",
    ],
    promotionChecklist: [
      "Do not cite derived speedPainScore/reliabilityPainScore without underlying evidence.",
      "Verify intervention evidence status before saying a route lacks treatment.",
      "Separate absent evidence from confirmed absence of an intervention.",
    ],
    knownFailureModes: [
      "Claiming no intervention when intervention sources are incomplete.",
      "Stacking derived scores without exposing raw detector evidence.",
    ],
  },
  {
    detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
    name: "Intervention underperformance",
    question: "Which evaluated interventions have non-positive peer-adjusted speed outcomes?",
    claimTemplate:
      "An evaluated treatment has non-positive peer-adjusted speed delta and current pain.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Intervention event, comparison status, adjusted speed delta, peer count, and current speed evidence.",
    ],
    supportingEvidenceExpected: [
      "Before/after window metadata and underlying current speed-hotspot support.",
    ],
    counterEvidenceRequired: [
      "Peer comparability limits, before/after window limits, and any positive official evaluation context.",
    ],
    promotionChecklist: [
      "Review peer construction before claiming underperformance.",
      "Check whether current pain and treatment evaluation windows are comparable.",
      "Prefer cautious language unless reviewed externally.",
    ],
    knownFailureModes: [
      "Overstating descriptive peer-adjusted deltas as causal impact.",
      "Ignoring route changes or construction windows in the comparison.",
    ],
  },
  {
    detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
    name: "Permit-correlated slowdown",
    question: "Which slow routes also have substantial DOT permit context?",
    claimTemplate: "Slow-speed evidence coincides with substantial DOT permit touches.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: [
      "Route-month speed signal and permit touch counts with uncertainty fields.",
    ],
    supportingEvidenceExpected: [
      "Permit source ids, route fanout, match weights, and context freshness.",
    ],
    counterEvidenceRequired: [
      "Permit fanout, low match weight, and unrelated work-type caveats before causal interpretation.",
    ],
    promotionChecklist: [
      "Use correlation/context language unless reviewed event-level permits support a cause.",
      "Check route fanout and permit types before promotion.",
      "Keep parking-like noisy joins out of detector-grade promotion.",
    ],
    knownFailureModes: [
      "Treating nearby permits as the cause of slow bus speed.",
      "Ignoring low-confidence route-touch fanout.",
    ],
  },
  {
    detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
    name: "311 service-request context",
    question: "Which slow routes also have substantial bus-relevant 311 service-request context?",
    claimTemplate: "Slow-speed evidence coincides with substantial 311 service-request context.",
    allowedClaimStrength: 2,
    primaryEvidenceRequired: ["Route-month speed signal and 311 context-event touch summary."],
    supportingEvidenceExpected: [
      "311 source ids, complaint event kind, match weights, and route fanout.",
    ],
    counterEvidenceRequired: [
      "Reporting bias, broad street-condition context, low match weight, and high route fanout caveats.",
    ],
    promotionChecklist: [
      "Keep the detector as context until complaint classes and event-level rows are reviewed.",
      "Check high-confidence touch support and average match weight.",
      "Avoid implying 311 complaints caused the speed condition.",
    ],
    knownFailureModes: [
      "Confusing complaint volume with operational cause.",
      "Promoting noisy street-level context without reviewing route fanout.",
    ],
  },
];

export const DETECTOR_SPECS: readonly FindingDetectorSpec[] = DETECTOR_SPEC_ROWS.map((row) =>
  FindingDetectorSpecSchema.parse(row),
);

export function detectorSpecFor(detectorId: string): FindingDetectorSpec {
  return (
    DETECTOR_SPECS.find((spec) => spec.detectorId === detectorId) ??
    FindingDetectorSpecSchema.parse({
      detectorId,
      name: detectorId,
      question: "Unknown detector; inspect source before review.",
      claimTemplate: "Unknown detector candidate requires manual source inspection.",
      allowedClaimStrength: 0,
      primaryEvidenceRequired: ["Detector source and evidence rows must be inspected manually."],
      supportingEvidenceExpected: ["Coverage audit rows and source-specific evidence."],
      counterEvidenceRequired: ["Manual reviewer must identify counter-evidence before promotion."],
      promotionChecklist: ["Do not promote until this detector has a written spec."],
      knownFailureModes: ["Unknown detector contract."],
    })
  );
}

export function detectorSpecsArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "findings", "detector-specs.json");
}

export function buildDetectorSpecsArtifact(args: {
  generatedAt: string;
}): FindingDetectorSpecsArtifact {
  return FindingDetectorSpecsArtifactSchema.parse({
    artifactKind: "finding_detector_specs",
    schemaVersion: 1,
    generatedAt: args.generatedAt,
    template: DETECTOR_SPEC_TEMPLATE,
    detectorCount: DETECTOR_SPECS.length,
    detectors: DETECTOR_SPECS,
  });
}

export async function writeDetectorSpecsArtifact(args: {
  artifactRoot: string;
  generatedAt: string;
}): Promise<string> {
  const path = detectorSpecsArtifactPath(args.artifactRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, buildDetectorSpecsArtifact({ generatedAt: args.generatedAt }));
  return path;
}
