import {
  citationByKey,
  citationLabel,
  type WikiCitationEvidence,
} from "@/components/route/WikiEvidence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SourceNoteEntry = { label: string; href?: string; detail?: string };

/** Resolve citation keys to deduped entries (dupes in served citationKeys
 * arrays are a known data issue — dedupe by key, then by label). */
export function citationEntries(
  evidence: WikiCitationEvidence | null,
  citationKeys: readonly string[],
): SourceNoteEntry[] {
  const byKey = citationByKey(evidence);
  const seen = new Set<string>();
  const entries: SourceNoteEntry[] = [];
  for (const key of citationKeys) {
    const citation = byKey.get(key);
    if (citation === undefined) continue;
    const label = citationLabel(citation);
    const dedupe = citation.key || label;
    if (seen.has(dedupe) || seen.has(label)) continue;
    seen.add(dedupe);
    seen.add(label);
    entries.push({ label, ...(citation.sourceUrl ? { href: citation.sourceUrl } : {}) });
  }
  return entries;
}

export function SourceNote({
  label = "Sources",
  entries,
}: {
  label?: string;
  entries: readonly SourceNoteEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[var(--bp-color-ink-55)] underline decoration-dotted underline-offset-2 hover:text-[var(--bp-color-ink)]">
        {label} ({entries.length})
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-[360px] p-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {entries.map((entry) => (
            <li key={entry.label} className="text-[11.5px] leading-[1.45]">
              {entry.href ? (
                <a
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--bp-color-accent)] underline-offset-2"
                >
                  {entry.label}
                </a>
              ) : (
                <span className="text-[var(--bp-color-ink-70)]">{entry.label}</span>
              )}
              {entry.detail ? (
                <div className="text-[10.5px] text-[var(--bp-color-ink-55)]">{entry.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
