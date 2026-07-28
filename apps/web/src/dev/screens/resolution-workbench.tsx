/**
 * Episode resolution workbench — operator tooling, not a proposed page.
 *
 * This is the only surface allowed to render `EpisodeResolutionAudit` and
 * `WithheldRecord`: raw record ids, dispositions, release pins, reviewer notes
 * and the withheld list. It is deliberately styled as an instrument so a
 * screenshot of it can never be mistaken for the consumer canvas, and it is
 * reached from the reviewer chrome rather than sitting beside the proposed
 * pages as a peer tab.
 */

import type { PublicEpisodeResolutionAuditArtifact } from "@bp/domain/studio/public-intervention-episode-audit";
import type {
  PublicInterventionEpisode,
  PublicInterventionEpisodesArtifact,
} from "@bp/domain/studio/public-intervention-episodes";
import { type ReactNode, useMemo, useState } from "react";

type EpisodeResolutionAudit = PublicEpisodeResolutionAuditArtifact["audits"][number];
type WithheldRecord = PublicEpisodeResolutionAuditArtifact["withheld"][number];
type WithholdReason = WithheldRecord["reason"];
type AuditDisposition = EpisodeResolutionAudit["records"][number]["disposition"];

const REASON_LABELS: Record<WithholdReason, string> = {
  no_reviewed_decision: "No reviewed decision names it",
  ambiguous_registry_match: "Registry match is ambiguous",
  other_route_change: "Defines a change on another route",
  programme_scoped: "Citywide programme record projected onto the route",
  reviewed_and_excluded: "Reviewed and excluded",
  undated: "No onset date",
  unresolved_relationship: "Relationship unresolved, withheld not guessed",
};

const DISPOSITION_TONES: Record<AuditDisposition, string> = {
  excluded: "text-[#f0a0a0]",
  included: "text-[#8fd6a6]",
  supporting: "text-[#9db8e8]",
  unresolved: "text-[#e8c87a]",
};

export function ResolutionWorkbench({
  artifact,
  audit,
  routeSlug,
}: {
  artifact: PublicInterventionEpisodesArtifact;
  audit: PublicEpisodeResolutionAuditArtifact;
  routeSlug: string;
}) {
  const [query, setQuery] = useState("");
  const auditById = useMemo(
    () => new Map(audit.audits.map((row) => [row.episodeId, row])),
    [audit.audits],
  );
  const routeId =
    audit.reviewRoutes.find((route) => route.slug === routeSlug)?.routeId ?? routeSlug;
  const routeEpisodes = artifact.episodes.filter((episode) =>
    episode.routes.some((route) => route.routeId === routeId),
  );
  const routeWithheld = audit.withheld.filter((record) => record.routeSlug === routeSlug);
  const matching = query.trim().length === 0 ? null : query.trim().toLowerCase();

  const byReason = new Map<WithholdReason, WithheldRecord[]>();
  for (const record of audit.withheld) {
    const list = byReason.get(record.reason) ?? [];
    list.push(record);
    byReason.set(record.reason, list);
  }

  return (
    <div className="flex flex-col gap-4 font-mono text-[11.5px] leading-[1.5] text-[#c9d1d9]">
      <Panel title="Projection scope">
        <dl className="m-0 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Fact label="approved occurrences" value={String(audit.scope.upstreamOccurrenceCount)} />
          <Fact
            label="reviewed reconciliations"
            value={String(audit.scope.reconciliationDecisionCount)}
          />
          <Fact
            label="registry events"
            value={`${audit.scope.registryEventCount} (${audit.scope.registryAttachedEventCount} attached, ${audit.scope.registryMintedEpisodeCount} minted)`}
          />
          <Fact label="public episodes" value={String(audit.scope.episodeCount)} />
          <Fact label="exact routes reached" value={String(audit.scope.routeReachCount)} />
          <Fact
            label="withheld records"
            value={`${audit.withheld.length} across ${audit.scope.reviewedRouteCount} review routes`}
          />
        </dl>
        <p className="mt-3 text-[11px] text-[#8b949e]">
          The withheld scan covers only the review routes listed below. It is not a corpus-wide
          audit, and no count here may reach a consumer surface.
        </p>
        <ul className="mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
          {audit.reviewRoutes.map((coverage) => {
            return (
              <li key={coverage.slug} className="text-[11px] text-[#8b949e]">
                {`${coverage.slug} → ${coverage.routeId}: ${coverage.timelineCount} timeline / ${coverage.treatmentCount} treatment / ${coverage.changeCandidateCount} candidates`}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Release pins">
        <dl className="m-0 flex flex-col gap-1.5">
          {audit.scope.releasePins.map((pin) => (
            <div
              key={pin.label}
              className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 max-sm:grid-cols-1"
            >
              <dt className="text-[#8b949e]">{pin.label}</dt>
              <dd className="m-0 min-w-0 break-all text-[10.5px]">{pin.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title={`Withheld records by reason (${audit.withheld.length})`}
        right={
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="filter record id or title"
            aria-label="Filter withheld records"
            className="w-[220px] rounded-[2px] border border-[#30363d] bg-[#0d1117] px-2 py-1 text-[11px] text-[#c9d1d9] placeholder:text-[#6e7681] max-sm:w-full"
          />
        }
      >
        <div className="flex flex-col gap-3">
          {[...byReason.entries()]
            .sort(([, left], [, right]) => right.length - left.length)
            .map(([reason, records]) => {
              const filtered =
                matching === null
                  ? records
                  : records.filter(
                      (record) =>
                        record.recordId.toLowerCase().includes(matching) ||
                        record.title.toLowerCase().includes(matching),
                    );
              if (filtered.length === 0) return null;
              return (
                <details key={reason} open={reason === "unresolved_relationship"}>
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="text-[#e6edf3]">{REASON_LABELS[reason]}</span>
                    <span className="ml-2 text-[#8b949e]">{filtered.length}</span>
                  </summary>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 border-l border-[#30363d] p-0 pl-3">
                    {filtered.map((record) => (
                      <li key={`${record.routeSlug}:${record.recordId}`}>
                        <div className="flex flex-wrap gap-x-2 text-[10.5px] text-[#8b949e]">
                          <span>{record.routeId}</span>
                          <span>{record.date === "" ? "undated" : record.date}</span>
                          <span>{record.precision}</span>
                        </div>
                        <div className="break-all text-[10.5px] text-[#79c0ff]">
                          {record.recordId}
                        </div>
                        <div className="text-[11px] text-[#c9d1d9]">{record.title}</div>
                        <div className="text-[10.5px] text-[#8b949e]">{record.note}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
        </div>
      </Panel>

      <Panel
        title={`Resolution trail for ${routeId} (${routeEpisodes.length} episodes, ${routeWithheld.length} withheld)`}
      >
        <div className="flex flex-col gap-3">
          {routeEpisodes.map((episode) => {
            const audit = auditById.get(episode.episodeId);
            if (audit === undefined) return null;
            return <AuditRow key={episode.episodeId} episode={episode} audit={audit} />;
          })}
        </div>
      </Panel>
    </div>
  );
}

function AuditRow({
  episode,
  audit,
}: {
  episode: PublicInterventionEpisode;
  audit: EpisodeResolutionAudit;
}) {
  const counts = new Map<string, number>();
  for (const record of audit.records) {
    counts.set(record.disposition, (counts.get(record.disposition) ?? 0) + 1);
  }
  return (
    <details className="border-l border-[#30363d] pl-3">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="text-[#e6edf3]">{episode.title}</div>
        <div className="flex flex-wrap gap-x-3 text-[10.5px] text-[#8b949e]">
          <span className="text-[#79c0ff]">{episode.episodeId}</span>
          <span>{audit.decisionKind}</span>
          <span>{`routes ${episode.routes.length}`}</span>
          <span>{`components ${episode.components.length}`}</span>
          {[...counts.entries()].map(([disposition, count]) => (
            <span key={disposition}>{`${disposition} ${count}`}</span>
          ))}
        </div>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <Fact label="decision ids" value={audit.decisionIds.join(", ")} />
        {audit.occurrenceId === null ? null : (
          <Fact label="occurrence id" value={audit.occurrenceId} />
        )}
        {audit.sourceEventIds.length === 0 ? null : (
          <Fact label="registry events" value={audit.sourceEventIds.join(", ")} />
        )}
        <Fact label="replacement state" value={audit.replacementState ?? "not applicable"} />
        {audit.reviewerNotes.map((note) => (
          <p key={note} className="m-0 text-[11px] text-[#8b949e]">
            {note}
          </p>
        ))}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {audit.records.map((record) => (
            <li
              key={record.recordId}
              className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 max-sm:grid-cols-1"
            >
              <span className={DISPOSITION_TONES[record.disposition]}>{record.disposition}</span>
              <span className="min-w-0">
                <span className="block break-all text-[10.5px] text-[#79c0ff]">
                  {record.recordId}
                </span>
                <span className="block text-[10.5px] text-[#8b949e]">{record.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[3px] border border-[#30363d] bg-[#161b22] p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] pb-2.5">
        <h2 className="m-0 text-[12px] font-semibold text-[#e6edf3]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 max-sm:grid-cols-1">
      <dt className="text-[#8b949e]">{label}</dt>
      <dd className="m-0 min-w-0 break-all">{value}</dd>
    </div>
  );
}
