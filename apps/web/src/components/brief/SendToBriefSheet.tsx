import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Direction, DirIndicator } from "@/components/DirIndicator";
import { RouteBadge } from "@/components/RouteBadge";
import { fetchStudioBriefs } from "@/studio/api-client.js";

/** The object being captured into a brief — a slow segment, finding, or metric. */
export type CaptureSource = {
  routeSlug: string;
  routeLabel: string;
  routeSbs: boolean;
  dir: Direction;
  from: string;
  to: string;
  mph: number;
};

type Destination = {
  id: string;
  title: string;
  sub: string;
  segs: number;
  recommended: boolean;
};

const NEW_BRIEF = "__new__";

/**
 * The "Send to brief" capture sheet — the one surface that takes any studio
 * object (here, a slow segment) and routes it into a brief. The captured object
 * is the subject of the sheet; the choice is where it lands. Existing briefs are
 * the live brief list; the route-matching brief is the ◆ AI MATCH. Confirming
 * opens the destination in the composer (creating from the route for a new one),
 * where the capture becomes a figure via "insert from the corpus".
 */
export function SendToBriefSheet({
  source,
  onClose,
}: {
  source: CaptureSource;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [destinations, setDestinations] = useState<readonly Destination[] | null>(null);
  const [selected, setSelected] = useState<string>(NEW_BRIEF);

  useEffect(() => {
    let live = true;
    void fetchStudioBriefs().then((response) => {
      if (!live) return;
      const rows: Destination[] = (response?.briefs ?? []).map((card) => ({
        id: card.brief.id,
        title: card.brief.title,
        sub: `${card.route.label}${card.route.sbs ? " SBS" : ""} · ${card.brief.status}`,
        segs: card.brief.claims.length,
        recommended: card.route.slug === source.routeSlug,
      }));
      rows.sort((a, b) => Number(b.recommended) - Number(a.recommended));
      setDestinations(rows);
      // Default to the AI-matched brief when one exists, else a new brief.
      setSelected(rows.find((row) => row.recommended)?.id ?? NEW_BRIEF);
    });
    return () => {
      live = false;
    };
  }, [source.routeSlug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = destinations?.find((row) => row.id === selected) ?? null;

  function confirm() {
    if (selected === NEW_BRIEF) {
      void navigate({ to: "/briefs/new", search: { route: source.routeSlug } });
      return;
    }
    void navigate({ to: "/briefs/$briefId/edit", params: { briefId: selected } });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(22,20,15,0.34)]"
      />
      <div className="relative z-10 mt-24 w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[7px] bg-[var(--bp-color-card-raised)] shadow-[0_24px_64px_rgba(22,20,15,.32)]">
        {/* Header — the captured object is the subject of the sheet */}
        <div className="px-6 pb-4 pt-[17px] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="mb-3 flex items-center">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--bp-color-ink-55)]">
              Send to brief
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel"
              className="text-[var(--bp-color-ink-40)] hover:text-[var(--bp-color-ink)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <RouteBadge route={source.routeLabel} sbs={source.routeSbs} size="md" />
            <DirIndicator dir={source.dir} />
            <span className="min-w-0 flex-1 truncate text-[16.5px] font-semibold tracking-[-0.012em]">
              {source.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {source.to}
            </span>
            <span className="font-mono text-[20px] font-semibold tracking-[-0.02em] text-[var(--bp-color-bad)]">
              {source.mph.toFixed(1)}
              <span className="ml-[3px] text-[11px] font-medium text-[var(--bp-color-ink-55)]">
                mph
              </span>
            </span>
          </div>
        </div>

        {/* Body — choose a destination */}
        <div className="px-4 pb-[18px] pt-4">
          <div className="mb-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--bp-color-ink-55)]">
            Add to
          </div>
          {destinations === null ? (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--bp-color-ink-40)]">
              Loading briefs…
            </div>
          ) : (
            <div role="radiogroup" className="flex flex-col">
              {destinations.map((dest) => (
                <DestRow
                  key={dest.id}
                  title={dest.title}
                  sub={dest.sub}
                  segs={dest.segs}
                  recommended={dest.recommended}
                  selected={selected === dest.id}
                  onSelect={() => setSelected(dest.id)}
                />
              ))}
              <DestRow
                isNew
                title="New brief"
                suggestion={`The ${source.routeLabel} ${source.from.split("/")[0]?.trim() ?? ""} corridor`}
                selected={selected === NEW_BRIEF}
                onSelect={() => setSelected(NEW_BRIEF)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 bg-[var(--bp-color-card)] px-6 py-[13px] shadow-[inset_0_1px_0_var(--bp-color-rule)]">
          <span className="flex-1 text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-40)]">
            Also on findings, metrics, and charts across the studio.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--bp-color-paper)]"
          >
            {selected === NEW_BRIEF ? "Create brief" : `Add to ${chosen?.title ?? "brief"}`}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DestRow({
  title,
  sub,
  suggestion,
  segs,
  recommended = false,
  isNew = false,
  selected,
  onSelect,
}: {
  title: string;
  sub?: string;
  suggestion?: string;
  segs?: number;
  recommended?: boolean;
  isNew?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="mb-[7px] flex items-center gap-3 rounded-[6px] px-3.5 py-3 text-left transition-[background,box-shadow] duration-150"
      style={{
        background: selected ? "var(--bp-color-accent-bg)" : "transparent",
        boxShadow: selected
          ? "inset 0 0 0 1.5px var(--bp-color-accent)"
          : "inset 0 0 0 1px var(--bp-color-rule)",
      }}
    >
      {isNew ? (
        <span
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-[14px] leading-none"
          style={{
            border: `1.5px ${selected ? "solid" : "dashed"} ${
              selected ? "var(--bp-color-accent)" : "var(--bp-color-ink-40)"
            }`,
            color: selected ? "var(--bp-color-accent)" : "var(--bp-color-ink-55)",
          }}
        >
          <Plus size={11} />
        </span>
      ) : (
        <span
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full"
          style={{
            border: `1.5px solid ${selected ? "var(--bp-color-accent)" : "var(--bp-color-ink-20)"}`,
            background: selected ? "var(--bp-color-accent)" : "transparent",
          }}
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-[-0.006em]">{title}</span>
          {recommended ? (
            <span className="rounded-[2px] bg-[var(--bp-color-card)] px-[5px] py-px font-mono text-[8.5px] font-bold tracking-[0.08em] text-[var(--bp-color-accent)] shadow-[inset_0_0_0_1px_var(--bp-color-accent)]">
              ◆ AI MATCH
            </span>
          ) : null}
        </span>
        {sub ? (
          <span className="mt-0.5 block text-[12px] leading-[1.35] text-[var(--bp-color-ink-55)]">
            {sub}
          </span>
        ) : null}
        {suggestion ? (
          <span
            className="mt-0.5 block text-[12px] leading-[1.35]"
            style={{
              color: selected ? "var(--bp-color-accent)" : "var(--bp-color-ink-55)",
              fontWeight: selected ? 600 : 500,
            }}
          >
            “{suggestion}”
          </span>
        ) : null}
      </span>

      {!isNew && segs !== undefined ? (
        <span className="shrink-0 font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">
          {segs} claim{segs === 1 ? "" : "s"}
        </span>
      ) : null}
    </button>
  );
}
