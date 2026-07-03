import type { StudioRouteEvidenceCitation } from "@/studio/api-contract";

export type WikiEvidenceCitation = Pick<
  StudioRouteEvidenceCitation,
  "key" | "sourceId" | "pageNumber" | "sourceTitle" | "publisher" | "sourceUrl" | "publishedDate"
>;

export type WikiCitationEvidence = {
  citations: readonly WikiEvidenceCitation[];
};

export function citationByKey(
  evidence: WikiCitationEvidence | null,
): Map<string, WikiEvidenceCitation> {
  return new Map((evidence?.citations ?? []).map((citation) => [citation.key, citation]));
}

export function citationLabel(citation: WikiEvidenceCitation): string {
  const source = citation.sourceTitle ?? citation.sourceId;
  const page = citation.pageNumber === undefined ? null : `p. ${citation.pageNumber}`;
  return [source, citation.publisher, citation.publishedDate, page].filter(Boolean).join(" / ");
}

export function CitationChips({
  evidence,
  citationKeys,
}: {
  evidence: WikiCitationEvidence | null;
  citationKeys: readonly string[];
}) {
  const citations = citationByKey(evidence);
  const rows = citationKeys
    .map((key) => citations.get(key))
    .filter((citation): citation is WikiEvidenceCitation => citation !== undefined);

  if (rows.length === 0) {
    return (
      <span className="font-mono text-[10px] font-semibold text-[var(--bp-color-bad)]">
        citation missing
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {rows.map((citation) =>
        citation.sourceUrl ? (
          <a
            key={citation.key}
            href={citation.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center rounded-[3px] border border-[var(--bp-color-accent)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            <span className="truncate">{citationLabel(citation)}</span>
          </a>
        ) : (
          <span
            key={citation.key}
            className="inline-flex max-w-full items-center rounded-[3px] border border-[var(--bp-color-ink-20)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--bp-color-ink-55)]"
          >
            <span className="truncate">{citationLabel(citation)}</span>
          </span>
        ),
      )}
    </span>
  );
}
