export function StudioFooter({
  sources = ["MTA Bus Speeds", "Hourly Ridership", "ACE program", "NYC DOT bus lanes"],
  updated = "2026-05-12",
}: {
  sources?: readonly string[];
  updated?: string;
}) {
  return (
    <footer className="flex flex-wrap items-center gap-2.5 border-t border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-7 py-2.5 text-[11px] text-[var(--bp-color-ink-55)]">
      <span className="text-[var(--bp-color-ink-40)]">Data</span>
      {sources.map((source, index) => (
        <span key={source} className="contents">
          <span className="text-[var(--bp-color-ink-70)]">{source}</span>
          {index < sources.length - 1 ? (
            <span className="text-[var(--bp-color-ink-20)]">·</span>
          ) : null}
        </span>
      ))}
      <div className="flex-1" />
      <span className="font-mono">updated {updated}</span>
      <span className="text-[var(--bp-color-ink-20)]">·</span>
      <span className="font-semibold text-[var(--bp-color-accent)]">Methodology →</span>
    </footer>
  );
}
