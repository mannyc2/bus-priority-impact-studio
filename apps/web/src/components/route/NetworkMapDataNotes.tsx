import type { MapManifestResponse } from "@bp/domain/maps";
import { useState } from "react";
import { type NetworkView, periodLabel, viewEncoding } from "@/components/route/network-map-model";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MapFactsStatus = "ready" | "unavailable" | "coverage_mismatch";

function metricNote(view: NetworkView, coverage: string | null): string {
  const encoding = viewEncoding(view);
  if (encoding === "delay") {
    return `Rider-hours of route-slice delay exposure; all observed timepoint segments; average-service-day route-hourly ridership denominator; coverage ${coverage ?? "unavailable"}. The browser displays the canonical precomputed value and does not recompute it.`;
  }
  if (encoding === "delta") {
    return `${periodLabel(view.period)} traversal-weighted route speed minus all-day route speed, in mph. This is a period comparison, not a six-month change claim.`;
  }
  return `${periodLabel(view.period)} bus speed in mph${
    view.period === "all" ? " from canonical route facts" : " weighted by observed traversals"
  }.`;
}

function sourceCurrencyNote(source: MapManifestResponse["sources"][number]): string {
  const currency = source.currency;
  if (currency.policy === "max_age_snapshot") {
    return `snapshot ${currency.fetchedAt ?? "date unavailable"}; evaluated ${currency.evaluatedAt}; ${source.currencyStatus}`;
  }
  if (currency.policy === "analysis_period") {
    return `coverage ${currency.coverage.start ?? "open"} through ${currency.coverage.end}; ${
      currency.coveragePassed ? "aligned" : "not aligned"
    }`;
  }
  return `revision pinned; source SHA-256 ${currency.sourceSha256 ?? "unavailable"}`;
}

export function networkMapCitationText({
  url,
  manifest,
  view,
  coverage,
  completeFactCount,
  mappedRouteCount,
  factsStatus,
  joinMessage,
}: {
  url: string;
  manifest: MapManifestResponse;
  view: NetworkView;
  coverage: string | null;
  completeFactCount: number;
  mappedRouteCount: number;
  factsStatus: MapFactsStatus;
  joinMessage: string | null;
}): string {
  const networkArtifact = manifest.artifacts.find(
    (artifact) => artifact.artifactKind === "map_network_simplified_geojson",
  );
  const routeFacts = manifest.routeFacts.status === "available" ? manifest.routeFacts : null;
  return [
    `Bus Priority Impact Studio network map — ${url}`,
    `Manifest release ${manifest.releaseId}; published ${manifest.publishedAt}; coverage ${manifest.coverage.start ?? "open"} through ${manifest.coverage.end}.`,
    `Universe Local/Limited/SBS; ${mappedRouteCount} mapped routes; ${completeFactCount}/${mappedRouteCount} complete route facts; manifest-declared verification ${manifest.verificationStatus}.`,
    factsStatus === "ready"
      ? "Rendered route-fact join: ready."
      : `Rendered route-fact join: ${factsStatus === "coverage_mismatch" ? "coverage mismatch detected" : "unavailable"}; route facts were not applied.${joinMessage === null ? "" : ` ${joinMessage}`}`,
    `View: ${metricNote(view, coverage)}`,
    `Network artifact: ${networkArtifact?.artifactKey ?? "unavailable"}; SHA-256 ${networkArtifact?.sha256 ?? "unavailable"}.`,
    `Route facts: ${routeFacts?.artifactKey ?? "unavailable"}; SHA-256 ${routeFacts?.sha256 ?? "unavailable"}.`,
    "Manifest alias: /api/v1/map/manifest.",
    "This current-alias URL is not an immutable archive. The cited hashes cover only the network and route-facts objects; the manifest has no exposed hash.",
  ].join("\n");
}

export function NetworkMapDataNotes({
  open,
  onOpenChange,
  manifest,
  view,
  coverage,
  completeFactCount,
  factsStatus,
  mappedRouteCount,
  visibleRouteCount,
  unverifiedBoroughCount,
  mapMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: MapManifestResponse | null;
  view: NetworkView;
  coverage: string | null;
  completeFactCount: number;
  factsStatus: MapFactsStatus;
  mappedRouteCount: number;
  visibleRouteCount: number;
  unverifiedBoroughCount: number;
  mapMessage: string | null;
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const networkArtifact = manifest?.artifacts.find(
    (artifact) => artifact.artifactKind === "map_network_simplified_geojson",
  );
  const copyCitation = async () => {
    if (
      manifest === null ||
      typeof navigator === "undefined" ||
      navigator.clipboard === undefined
    ) {
      setCopyStatus("Copy is unavailable in this browser.");
      return;
    }
    const url = typeof window === "undefined" ? "/map" : window.location.href;
    try {
      await navigator.clipboard.writeText(
        networkMapCitationText({
          url,
          manifest,
          view,
          coverage,
          completeFactCount,
          mappedRouteCount,
          factsStatus,
          joinMessage: mapMessage,
        }),
      );
      setCopyStatus("View URL and release citation copied.");
    } catch {
      setCopyStatus("Copy was blocked by the browser.");
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(92vw,440px)] gap-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-[var(--bp-color-rule)] pr-12">
          <SheetTitle>Network map data notes</SheetTitle>
          <SheetDescription>
            Release, coverage, sources, layers, and integrity references for this view.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-[12px] leading-relaxed">
          {manifest === null ? (
            <p className="m-0 text-[var(--bp-color-ink-55)]">
              The map manifest is unavailable, so release metadata cannot be cited.
            </p>
          ) : (
            <>
              <section>
                <h3 className="m-0 text-[12px] font-semibold">Release and universe</h3>
                <dl className="mt-2 grid grid-cols-[128px_1fr] gap-x-3 gap-y-1">
                  <dt className="text-[var(--bp-color-ink-55)]">Release</dt>
                  <dd className="m-0 break-all font-mono">{manifest.releaseId}</dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Published</dt>
                  <dd className="m-0 font-mono">{manifest.publishedAt}</dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Coverage</dt>
                  <dd className="m-0">
                    {manifest.coverage.start ?? "Open start"} through {manifest.coverage.end}
                  </dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Profile</dt>
                  <dd className="m-0">{manifest.releaseProfile}</dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Verification</dt>
                  <dd className="m-0">
                    {manifest.verificationStatus}; build {manifest.buildStatus};{" "}
                    {manifest.issueCount} issues
                  </dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Included</dt>
                  <dd className="m-0">{manifest.routeUniverse.includedRouteTypes.join(", ")}</dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Excluded</dt>
                  <dd className="m-0">{manifest.routeUniverse.excludedRouteTypes.join(", ")}</dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Mapped / expected</dt>
                  <dd className="m-0">
                    {manifest.routeUniverse.geometryRouteIds.length}/
                    {manifest.routeUniverse.expectedRouteIds.length}; {visibleRouteCount} visible
                  </dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Complete facts</dt>
                  <dd className="m-0">
                    {completeFactCount}/{mappedRouteCount}; {factsStatus}
                  </dd>
                  <dt className="text-[var(--bp-color-ink-55)]">Borough gaps</dt>
                  <dd className="m-0">
                    {unverifiedBoroughCount} mapped routes have no verified served-borough
                    membership and appear only in All boroughs.
                  </dd>
                </dl>
                {mapMessage === null ? null : (
                  <p className="m-0 mt-2 text-[var(--bp-color-ink-55)]" role="status">
                    {mapMessage}
                  </p>
                )}
                <details className="mt-2 rounded-[3px] border border-[var(--bp-color-rule)] p-2">
                  <summary className="cursor-pointer font-semibold">
                    Exact declared route universe ({manifest.routeUniverse.expectedRouteIds.length})
                  </summary>
                  <p className="m-0 mt-2 break-words font-mono text-[10px] leading-relaxed text-[var(--bp-color-ink-55)]">
                    {manifest.routeUniverse.expectedRouteIds.join(", ")}
                  </p>
                </details>
              </section>

              <section>
                <h3 className="m-0 text-[12px] font-semibold">Active metric</h3>
                <p className="m-0 mt-1 text-[var(--bp-color-ink-70)]">
                  {metricNote(view, coverage)}
                </p>
                <p className="m-0 mt-1 text-[var(--bp-color-ink-55)]">
                  Six-month change is withheld because its endpoint months are not served.
                </p>
              </section>

              <section>
                <h3 className="m-0 text-[12px] font-semibold">Sources</h3>
                <ul className="m-0 mt-1 space-y-2 p-0">
                  {manifest.sources.map((source) => (
                    <li key={source.sourceId} className="list-none">
                      <b>{source.sourceId}</b> — {source.readiness}; {sourceCurrencyNote(source)}.
                      <span className="block text-[var(--bp-color-ink-55)]">{source.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="m-0 text-[12px] font-semibold">Layers</h3>
                <ul className="m-0 mt-1 space-y-1 p-0">
                  {manifest.layers.map((layer) => (
                    <li key={layer.layerId} className="list-none">
                      <b>{layer.layerId}</b> — {layer.readiness}, {layer.currencyStatus};{" "}
                      {layer.featureCount} features / {layer.routeCount} routes.
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-2 text-[var(--bp-color-ink-55)]">
                  NYC DOT bus lanes are source geometry, not operating-hour coverage or a route
                  treatment claim.
                </p>
              </section>

              <section>
                <h3 className="m-0 text-[12px] font-semibold">Integrity references</h3>
                <dl className="mt-2 grid gap-2">
                  <div>
                    <dt className="text-[var(--bp-color-ink-55)]">Network artifact</dt>
                    <dd className="m-0 break-all font-mono text-[10.5px]">
                      {networkArtifact?.artifactKey ?? "unavailable"}
                      <br />
                      SHA-256 {networkArtifact?.sha256 ?? "unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--bp-color-ink-55)]">Compact route facts</dt>
                    <dd className="m-0 break-all font-mono text-[10.5px]">
                      {manifest.routeFacts.status === "available"
                        ? manifest.routeFacts.artifactKey
                        : "unavailable"}
                      <br />
                      SHA-256{" "}
                      {manifest.routeFacts.status === "available"
                        ? manifest.routeFacts.sha256
                        : "unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--bp-color-ink-55)]">Manifest alias</dt>
                    <dd className="m-0 font-mono text-[10.5px]">/api/v1/map/manifest</dd>
                  </div>
                </dl>
                <p className="m-0 mt-2 text-[var(--bp-color-ink-55)]">
                  The manifest exposes no hash. This current-alias URL is not an immutable archive;
                  copied hashes cover only the network and route-facts objects, not other manifest
                  metadata.
                </p>
              </section>

              <section>
                <h3 className="m-0 text-[12px] font-semibold">Quality</h3>
                <p className="m-0 mt-1">
                  {manifest.quality.releaseLayer}; {manifest.quality.completenessStatus}; confidence{" "}
                  {manifest.quality.confidence}.
                </p>
                {manifest.quality.caveats.length === 0 ? null : (
                  <ul className="mb-0 mt-1 pl-4">
                    {manifest.quality.caveats.map((caveat) => (
                      <li key={caveat}>{caveat}</li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
        <div className="border-t border-[var(--bp-color-rule)] p-4">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={manifest === null}
            onClick={copyCitation}
          >
            Copy view + citation
          </Button>
          {copyStatus === null ? null : (
            <p
              className="m-0 mt-2 text-center text-[11px] text-[var(--bp-color-ink-55)]"
              role="status"
            >
              {copyStatus}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
