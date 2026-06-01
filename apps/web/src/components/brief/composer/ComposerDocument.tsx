import { Plus } from "lucide-react";
import { useDraftBrief } from "../DraftBriefContext.js";
import { BriefProse } from "../prose/BriefProse.js";
import { Block, EvidenceFigure, GutterMark } from "./atoms.js";
import { type CorpusOption, CorpusPalette } from "./CorpusPalette.js";

/**
 * The editorial column — the brief in its published shape, fully editable. Each
 * claim is a §-numbered section: the heading and prose are real, editable text
 * (the active section drives the undo/redo history); attached evidence renders
 * inline as the figures themselves. The unified corpus surface opens at the
 * active section to stream a matching figure in.
 */
export function ComposerDocument() {
  const { state, actions, meta } = useDraftBrief();
  const { brief } = meta;
  const pendingActive = state.pendingAction !== null;

  return (
    <div className="flex justify-center px-7 pb-16 pt-12 max-sm:px-4">
      <article className="relative w-[780px] max-w-full pl-11">
        {brief.claims.map((claim) => {
          const isActive = claim.n === state.activeClaimN;
          const figures = claim.evidenceIds
            .map((id) => brief.evidence.find((evidence) => evidence.id === id))
            .filter((evidence) => evidence !== undefined);

          const attachedIds = new Set(claim.evidenceIds);
          const options: CorpusOption[] = brief.evidence
            .filter((evidence) => !attachedIds.has(evidence.id))
            .map((evidence, index) => ({ evidence, best: index === 0 }));

          return (
            <section key={claim.n} className="mb-7">
              <Block mark={isActive} markPulse={isActive && pendingActive}>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[15px] font-semibold tabular-nums text-[var(--bp-color-ink-40)]">
                    {String(claim.n).padStart(2, "0")}
                  </span>
                  {isActive ? (
                    <input
                      key={`title-${claim.n}`}
                      defaultValue={claim.title}
                      aria-label={`Section ${claim.n} heading`}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== claim.title) actions.saveClaim(claim.n, { title: next });
                      }}
                      className="w-full flex-1 border-0 bg-transparent text-[23px] font-semibold leading-[1.18] tracking-[-0.018em] text-[var(--bp-color-ink)] outline-none placeholder:text-[var(--bp-color-ink-40)]"
                    />
                  ) : (
                    <h2 className="m-0 text-[23px] font-semibold leading-[1.18] tracking-[-0.018em] text-[var(--bp-color-ink)]">
                      {claim.title}
                    </h2>
                  )}
                </div>

                <div className="mt-3.5">
                  {isActive ? (
                    <textarea
                      value={state.editor.text}
                      onChange={(event) => actions.editActiveText(event.target.value)}
                      onBlur={actions.commitActiveText}
                      placeholder="Write this section — AI streams the matching figure in as you go."
                      className="block w-full resize-none border-0 bg-transparent text-[16px] leading-[1.72] text-[var(--bp-color-ink-70)] outline-none [field-sizing:content] placeholder:text-[var(--bp-color-ink-40)]"
                      style={{ minHeight: "3.5em" }}
                    />
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => actions.setActiveClaimN(claim.n)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") actions.setActiveClaimN(claim.n);
                      }}
                      className="w-full cursor-text text-[16px] text-[var(--bp-color-ink-70)]"
                    >
                      {claim.body ? (
                        <BriefProse markdown={claim.body} blocks={brief.blocks} />
                      ) : (
                        <span className="text-[var(--bp-color-ink-40)]">Write this section…</span>
                      )}
                    </div>
                  )}
                </div>
              </Block>

              {figures.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {figures.map((evidence) => (
                    <EvidenceFigure
                      key={evidence.id}
                      evidence={evidence}
                      streaming={state.justInsertedId === evidence.id}
                    />
                  ))}
                </div>
              ) : null}

              {isActive ? (
                <div className="relative mt-3.5">
                  {state.corpusOpen ? (
                    <>
                      <GutterMark />
                      <CorpusPalette
                        query={claim.title.split(/\s+/).slice(0, 2).join(" ").toLowerCase()}
                        options={options}
                        onPick={actions.insertEvidence}
                      />
                      <button
                        type="button"
                        onClick={actions.closeCorpus}
                        className="mt-2 font-mono text-[10.5px] text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
                      >
                        esc · keep writing
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={actions.openCorpus}
                      className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[12.5px] font-medium text-[var(--bp-color-accent)] hover:bg-[var(--bp-color-accent-bg)]"
                    >
                      <Plus size={13} />
                      Insert from the corpus
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}

        <button
          type="button"
          onClick={() =>
            actions.addClaim({ title: "New section", strength: 1, evidenceIds: [], caveatIds: [] })
          }
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
        >
          <Plus size={13} />
          Add a section
        </button>
      </article>
    </div>
  );
}
