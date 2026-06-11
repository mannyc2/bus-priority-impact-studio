import type { StudioComment, StudioCommentReply } from "@/studio/api-contract.js";
import { useReviewBrief } from "../ReviewBriefContext.js";

function CommentAvatar({ initials, size = 22 }: { initials: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--bp-color-paper)] font-bold text-[var(--bp-color-ink)] shadow-[inset_0_0_0_1.5px_var(--bp-color-ink-40)]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

function ReplyRow({ reply }: { reply: StudioCommentReply }) {
  return (
    <div className="mt-2.5 pl-2.5 shadow-[inset_2px_0_0_var(--bp-color-rule)]">
      <div className="flex items-center gap-1.5">
        <CommentAvatar initials={reply.initials} size={18} />
        <span className="text-[11.5px] font-semibold">{reply.author}</span>
        <span className="flex-1" />
        <span className="font-mono text-[9.5px] text-[var(--bp-color-ink-40)]">{reply.ago}</span>
      </div>
      <p className="mt-1 m-0 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
        {reply.body}
      </p>
    </div>
  );
}

function CommentCard({
  comment,
  pin,
  active,
  onClick,
  onResolve,
}: {
  comment: StudioComment;
  pin: number | null;
  active: boolean;
  onClick: () => void;
  onResolve: () => void;
}) {
  const isChange = comment.kind === "change-requested";
  const accent = isChange ? "var(--bp-color-bad)" : "var(--bp-color-ink-40)";
  return (
    <li
      className="mb-2.5 rounded-[8px] p-3 transition-shadow"
      style={{
        background: comment.resolved ? "transparent" : "var(--bp-color-card)",
        opacity: comment.resolved && !active ? 0.6 : 1,
        boxShadow: active
          ? `0 6px 18px rgba(22,20,15,.10), inset 0 0 0 1.5px ${accent}`
          : "inset 0 0 0 1px var(--bp-color-rule)",
      }}
    >
      <button type="button" onClick={onClick} className="block w-full cursor-pointer text-left">
        <div className="flex items-center gap-2">
          {pin !== null ? (
            <span
              className="flex size-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white"
              style={{ background: accent }}
            >
              {pin}
            </span>
          ) : null}
          <CommentAvatar initials={comment.initials} />
          <span className="text-[12.5px] font-semibold">{comment.author}</span>
          {isChange ? (
            <span className="rounded-[2px] bg-[var(--bp-color-bad-bg)] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[0.06em] text-[var(--bp-color-bad)]">
              CHANGE
            </span>
          ) : null}
          <span className="flex-1" />
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-40)]">{comment.ago}</span>
        </div>

        {comment.on ? (
          <div className="mt-2 truncate text-[11px] italic text-[var(--bp-color-ink-55)]">
            on &ldquo;{comment.on}&rdquo;
          </div>
        ) : null}

        <div
          className="mt-2 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink)]"
          style={
            active
              ? undefined
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }
          }
        >
          {comment.body}
        </div>

        {active
          ? comment.replies?.map((reply, index) => <ReplyRow key={index} reply={reply} />)
          : null}
      </button>

      {active && !comment.resolved ? (
        <div className="mt-3 flex items-center gap-3 text-[11.5px]">
          <button
            type="button"
            onClick={onResolve}
            className="cursor-pointer text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
          >
            Resolve
          </button>
        </div>
      ) : null}

      {comment.resolved ? (
        <div className="mt-2 font-mono text-[10.5px] font-semibold text-[var(--bp-color-good)]">
          ✓ resolved
        </div>
      ) : null}
    </li>
  );
}

const MODES: ReadonlyArray<{ id: StudioComment["kind"]; label: string }> = [
  { id: "comment", label: "Comment" },
  { id: "change-requested", label: "Request change" },
];

/**
 * The comment margin — open/resolved tally, the comment thread cards, and the
 * reviewer composer. Comment add/resolve are local history (no write endpoint),
 * so a new comment pins to the selected claim rather than a text selection.
 */
export function CommentMargin() {
  const { state, actions } = useReviewBrief();
  const open = state.comments.filter((comment) => !comment.resolved);
  const resolved = state.comments.length - open.length;

  // Pin ordinals track the open comments in document order, tying card ↔ prose.
  let nextPin = 0;
  const pins = new Map<string, number>();
  for (const comment of state.comments) {
    if (!comment.resolved) pins.set(comment.id, ++nextPin);
  }

  const submitLabel = state.composerMode === "change-requested" ? "Request change" : "Comment";

  return (
    <div className="flex min-h-0 flex-col bg-[var(--bp-color-paper)] shadow-[inset_1px_0_0_var(--bp-color-rule)]">
      <div className="flex items-baseline gap-2 px-[18px] py-[15px] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--bp-color-ink-55)]">
          Comments
        </div>
        <span className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">
          {open.length} open · {resolved} resolved
        </span>
      </div>

      <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-3.5">
        {state.comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            pin={pins.get(comment.id) ?? null}
            active={state.activeCommentId === comment.id}
            onClick={() => actions.setActiveComment(comment.id)}
            onResolve={() => actions.resolveComment(comment.id)}
          />
        ))}
        {state.comments.length === 0 ? (
          <li className="px-1 py-6 text-center text-[12px] text-[var(--bp-color-ink-40)]">
            No comments yet. Mark up the brief below.
          </li>
        ) : null}
      </ul>

      <div className="bg-[var(--bp-color-card)] p-3.5 shadow-[inset_0_1px_0_var(--bp-color-rule)]">
        <div className="mb-2 flex w-fit gap-1 rounded-[7px] bg-[var(--bp-color-paper-deep)] p-[3px]">
          {MODES.map((mode) => {
            const selected = state.composerMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => actions.setComposerMode(mode.id)}
                className="rounded-[5px] px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors"
                style={{
                  background: selected ? "var(--bp-color-card)" : "transparent",
                  color: selected ? "var(--bp-color-ink)" : "var(--bp-color-ink-55)",
                  boxShadow: selected ? "0 1px 2px rgba(22,20,15,.12)" : "none",
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={state.commentDraft}
          onChange={(event) => actions.setCommentDraft(event.target.value)}
          placeholder={
            state.composerMode === "change-requested"
              ? "Request a change on this claim…"
              : "Comment on this claim…"
          }
          rows={2}
          className="block w-full resize-none rounded-[6px] bg-[var(--bp-color-paper)] px-3 py-2.5 text-[12.5px] leading-[1.5] text-[var(--bp-color-ink)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] outline-none focus:shadow-[inset_0_0_0_1px_var(--bp-color-ink-40)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-[var(--bp-color-ink-40)]">
            Pinned to claim {String(state.selectedClaimN).padStart(2, "0")}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => actions.setCommentDraft("")}
            className="rounded-[3px] px-2.5 py-1 text-[11.5px] font-medium text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={actions.addComment}
            disabled={state.commentDraft.trim().length === 0}
            className="rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-1 text-[11.5px] font-medium text-[var(--bp-color-paper)] disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
