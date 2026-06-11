import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

/**
 * Props shared by every compare section: both routes' full detail responses plus
 * their (optional) history. `a`/`b` are the same detail responses the compare
 * loader fetched; `a.route`/`b.route` also back the CompareProvider above.
 */
export type CompareSides = {
  a: StudioRouteDetailResponse;
  b: StudioRouteDetailResponse;
  historyA: StudioRouteHistoryResponse | null;
  historyB: StudioRouteHistoryResponse | null;
};
