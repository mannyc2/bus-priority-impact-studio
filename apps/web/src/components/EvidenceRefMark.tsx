export function EvidenceRefMark({ n }: { n: number | string }) {
  return (
    <sup className="ml-px cursor-help align-super text-[0.62em] font-semibold leading-none text-[var(--bp-color-accent)]">
      {n}
    </sup>
  );
}
