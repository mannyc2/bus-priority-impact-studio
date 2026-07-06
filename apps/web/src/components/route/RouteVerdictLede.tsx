export function RouteVerdictLede({ lede }: { lede: string | null }) {
  if (lede === null) return null;

  return (
    <section className="border-l-[3px] border-[var(--bp-color-ink)] pl-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-55)]">
        The route right now
      </div>
      <p className="m-0 mt-2 max-w-[900px] text-[16.5px] leading-[1.6] text-[var(--bp-color-ink)]">
        {lede}
      </p>
    </section>
  );
}
