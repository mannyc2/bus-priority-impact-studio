type RouteCoverageStatus = "full" | "no_observed_speed";

type PublicRouteVisibilityInput = {
  routeId: string;
  routeLongName: string | null;
  routeTypes: string[];
  shapeCount: number;
  coverageStatus: RouteCoverageStatus;
};

export type PublicRouteVisibilityReason =
  | "standard_route"
  | "temporary_shuttle_without_observed_speed"
  | "placeholder_without_public_metadata";

export type PublicRouteVisibility = {
  publicVisible: boolean;
  reason: PublicRouteVisibilityReason;
};

function looksLikeTemporaryShuttle(routeLongName: string | null): boolean {
  return routeLongName?.includes("Shuttle Bus") ?? false;
}

function lacksPublicMetadata(input: PublicRouteVisibilityInput): boolean {
  return input.routeLongName === null && input.routeTypes.length === 0 && input.shapeCount === 0;
}

export function classifyPublicRouteVisibility(
  input: PublicRouteVisibilityInput,
): PublicRouteVisibility {
  if (
    looksLikeTemporaryShuttle(input.routeLongName) &&
    input.coverageStatus === "no_observed_speed"
  ) {
    return {
      publicVisible: false,
      reason: "temporary_shuttle_without_observed_speed",
    };
  }

  if (lacksPublicMetadata(input)) {
    return {
      publicVisible: false,
      reason: "placeholder_without_public_metadata",
    };
  }

  return {
    publicVisible: true,
    reason: "standard_route",
  };
}
