export type ReviewState = "approved" | "requested-changes" | "reviewing" | "idle";

const reviewToneVar: Record<ReviewState, string> = {
  approved: "var(--bp-color-good)",
  "requested-changes": "var(--bp-color-bad)",
  reviewing: "var(--bp-color-warn)",
  idle: "var(--bp-color-ink-40)",
};

export function ReviewerChip({ initials, state }: { initials: string; state: ReviewState }) {
  return (
    <span
      className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--bp-color-paper)] text-[10.5px] font-bold text-[var(--bp-color-ink)]"
      style={{ boxShadow: `inset 0 0 0 1.5px ${reviewToneVar[state]}, 0 0 0 1.5px white` }}
      title={state}
    >
      {initials}
    </span>
  );
}

export function ReviewerStack({
  reviewers,
}: {
  reviewers: ReadonlyArray<{ initials: string; state: ReviewState }>;
}) {
  return (
    <span className="inline-flex">
      {reviewers.map((reviewer, index) => (
        <span
          key={`${reviewer.initials}-${reviewer.state}`}
          style={{ marginLeft: index === 0 ? 0 : -8 }}
        >
          <ReviewerChip initials={reviewer.initials} state={reviewer.state} />
        </span>
      ))}
    </span>
  );
}
