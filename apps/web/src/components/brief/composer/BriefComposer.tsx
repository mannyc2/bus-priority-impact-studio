import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useDraftBrief } from "../DraftBriefContext.js";
import { ChromeUndoRedo, CorpusStatus } from "./atoms.js";
import { BriefPeople, type SharePerson } from "./BriefPeople.js";
import { ComposerDocument } from "./ComposerDocument.js";
import { ComposerTopBar } from "./ComposerTopBar.js";

// Share roster is local chrome until the backend exposes brief access roles.
const SHARE_PEOPLE: readonly SharePerson[] = [
  { initials: "JL", name: "J. Lim", role: "Author", access: "Owner", you: true },
  { initials: "CP", name: "C. Pherson", role: "Sr. analyst", access: "Can edit" },
  { initials: "SR", name: "S. Rivera", role: "Data", access: "Can comment" },
];

/**
 * The converged composer. Consumes the backed DraftBrief provider — the top bar
 * and the editorial document are siblings reading the same editor slice, so
 * undo/redo in the chrome drives the prose in the document.
 */
export function BriefComposer() {
  const { state, actions, meta } = useDraftBrief();
  const { brief, route } = meta;

  const savedLabel = state.pendingAction
    ? "saving…"
    : state.editor.dirty
      ? "unsaved edits"
      : "saved";

  return (
    <div className="flex min-h-full flex-col bg-[var(--bp-color-paper)]">
      <ComposerTopBar
        routeLabel={route.label}
        routeSbs={route.sbs}
        title={brief.title}
        savedLabel={savedLabel}
        tools={
          <ChromeUndoRedo
            canUndo={state.editor.canUndo}
            canRedo={state.editor.canRedo}
            onUndo={actions.undoEdit}
            onRedo={actions.redoEdit}
          />
        }
        status={<CorpusStatus />}
        action={
          <div className="ml-3.5 flex items-center gap-2.5">
            <BriefPeople people={SHARE_PEOPLE} />
            <span className="h-[22px] w-px bg-[var(--bp-color-rule)]" />
            <Link
              to="/briefs/$briefId"
              params={{ briefId: brief.id }}
              viewTransition
              className="inline-flex h-8 items-center rounded-[3px] px-3 text-[12.5px] font-medium text-[var(--bp-color-ink)] no-underline shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
            >
              Preview
            </Link>
            <Link
              to="/briefs/$briefId/review"
              params={{ briefId: brief.id }}
              viewTransition
              className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
            >
              Send for review
              <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {state.writeError ? (
        <div className="flex items-center gap-3 bg-[var(--bp-color-bad-bg)] px-7 py-2.5 text-[12px] text-[var(--bp-color-bad)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <span className="flex-1">
            Draft change didn’t save: {state.writeError} (editing requires an operator session).
          </span>
          <button
            type="button"
            onClick={actions.clearWriteError}
            aria-label="Dismiss"
            className="text-[var(--bp-color-bad)]"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <ComposerDocument />

      <div className="mt-auto flex items-center gap-2.5 bg-[var(--bp-color-card)] px-7 py-3 text-[11.5px] text-[var(--bp-color-ink-55)] shadow-[inset_0_1px_0_var(--bp-color-rule)]">
        <span className="text-[var(--bp-color-accent)]">◆</span>
        You write and edit the prose directly. As you write, the corpus surface proposes its
        best-matching figure; it streams in as a real primitive, citing the data it draws on. Never
        a chat turn.
      </div>
    </div>
  );
}
