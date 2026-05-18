export function CommentBadge({ count }: { count: number }) {
  const warning = count >= 3;
  return (
    <span
      className={`inline-flex items-center gap-[3px] rounded-[10px] px-[7px] py-0.5 text-[10.5px] font-bold ${
        warning
          ? "bg-[var(--bp-color-warn-bg)] text-[var(--bp-color-warn)]"
          : "bg-[var(--bp-color-ink-06)] text-[var(--bp-color-ink-70)]"
      }`}
      title={`${count} comment${count === 1 ? "" : "s"}`}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path d="M2 2h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H6l-3 2V9H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      </svg>
      {count}
    </span>
  );
}
