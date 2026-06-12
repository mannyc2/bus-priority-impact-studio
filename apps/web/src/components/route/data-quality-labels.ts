import type { StudioQuality } from "@/studio/api-contract";

type ReleaseLayer = StudioQuality["releaseLayer"];
type CompletenessStatus = StudioQuality["completenessStatus"];

const RELEASE_LAYER_COPY: Record<ReleaseLayer, { label: string; description: string }> = {
  baseline_release: {
    label: "Baseline Release",
    description: "Reviewed baseline rollup for public route comparisons.",
  },
  current_signal: {
    label: "Current Signal",
    description: "Fresher appendix evidence with explicit provenance and coverage caveats.",
  },
  pending_publication: {
    label: "Pending Publication",
    description: "Prepared locally and not yet promoted to the public serving projection.",
  },
  observed_release: {
    label: "Observed Release",
    description: "The public observed release currently backing this route surface.",
  },
};

const COMPLETENESS_STATUS_LABELS: Record<CompletenessStatus, string> = {
  complete: "complete",
  partial_public_monthly_only: "partial public monthly only",
  missing_realtime: "missing realtime",
  insufficient_samples: "insufficient samples",
  source_lag_expected: "source lag expected",
  unavailable: "unavailable",
};

export function releaseLayerLabel(layer: ReleaseLayer): string {
  return RELEASE_LAYER_COPY[layer].label;
}

export function releaseLayerDescription(layer: ReleaseLayer): string {
  return RELEASE_LAYER_COPY[layer].description;
}

export function completenessStatusLabel(status: CompletenessStatus): string {
  return COMPLETENESS_STATUS_LABELS[status];
}
