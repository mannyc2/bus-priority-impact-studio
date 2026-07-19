import type { StudioQuality } from "@/studio/api-contract";

type ReleaseLayer = StudioQuality["releaseLayer"];
type CompletenessStatus = StudioQuality["completenessStatus"];

const RELEASE_LAYER_COPY: Record<ReleaseLayer, { label: string; description: string }> = {
  published_release: {
    label: "Published Release",
    description: "Reviewed published data currently backing public route surfaces.",
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
  partial_public_speed_only: "partial public speed only",
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
