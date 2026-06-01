import { ChevronDown, Globe, UserPlus } from "lucide-react";
import { useState } from "react";

export type SharePerson = {
  initials: string;
  name: string;
  role: string;
  access: "Owner" | "Can edit" | "Can comment";
  you?: boolean;
};

function Avatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--bp-color-paper)] font-bold text-[var(--bp-color-ink)] shadow-[inset_0_0_0_1.5px_var(--bp-color-ink-40),0_0_0_1.5px_var(--bp-color-card)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

/**
 * Share / access control for the composer chrome. Avatar stack opens a popover
 * listing who has access and their level, an invite row, and link access.
 * Self-contained: owns its open state with a click-away backdrop. (Share data
 * is local until the backend exposes brief access roles.)
 */
export function BriefPeople({
  people,
  linkAccess = "Anyone at MTA with the link can comment",
}: {
  people: readonly SharePerson[];
  linkAccess?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex items-center gap-2.5 rounded-[18px] py-[5px] pl-1.5 pr-[11px] transition-shadow"
        style={{ boxShadow: `inset 0 0 0 1px ${open ? "var(--bp-color-ink-40)" : "var(--bp-color-rule)"}` }}
      >
        <span className="flex">
          {people.slice(0, 4).map((person, index) => (
            <span key={person.initials} style={{ marginLeft: index ? -7 : 0 }}>
              <Avatar initials={person.initials} />
            </span>
          ))}
        </span>
        <span className="text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">Share</span>
        <ChevronDown
          size={12}
          className="text-[var(--bp-color-ink-40)] transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[25]"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-30 w-[304px] overflow-hidden rounded-[8px] bg-[var(--bp-color-card-raised)] shadow-[0_18px_44px_rgba(22,20,15,.26),inset_0_0_0_1px_var(--bp-color-rule)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3.5 pb-[11px] pt-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
              <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--bp-color-ink-55)]">
                Share this brief
              </div>
              <div className="flex gap-1.5">
                <div className="flex flex-1 items-center rounded-[6px] bg-[var(--bp-color-paper)] px-2.5 py-2 text-[12px] text-[var(--bp-color-ink-40)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                  Add people or teams…
                </div>
                <div className="flex cursor-pointer items-center gap-1 rounded-[6px] bg-[var(--bp-color-paper)] px-2.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                  Comment
                  <ChevronDown size={9} className="text-[var(--bp-color-ink-40)]" />
                </div>
              </div>
            </div>

            <div className="max-h-[204px] overflow-auto px-2 py-1.5">
              {people.map((person) => (
                <div
                  key={person.initials}
                  className="flex items-center gap-2.5 rounded-[5px] px-2 py-2 hover:bg-[var(--bp-color-ink-06)]"
                >
                  <Avatar initials={person.initials} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold leading-tight">
                      {person.name}
                      {person.you ? " (you)" : ""}
                    </div>
                    <div className="text-[10.5px] text-[var(--bp-color-ink-55)]">{person.role}</div>
                  </div>
                  <span
                    className="inline-flex items-center gap-[3px] text-[11px]"
                    style={{
                      color:
                        person.access === "Owner"
                          ? "var(--bp-color-ink-55)"
                          : "var(--bp-color-ink-70)",
                      fontWeight: person.access === "Owner" ? 400 : 600,
                    }}
                  >
                    {person.access}
                    {person.access !== "Owner" ? (
                      <ChevronDown size={9} className="text-[var(--bp-color-ink-40)]" />
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2.5 shadow-[inset_0_1px_0_var(--bp-color-rule)]">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--bp-color-accent-bg)] text-[var(--bp-color-accent)]">
                <Globe size={14} />
              </span>
              <div className="flex-1 text-[11.5px] leading-[1.35] text-[var(--bp-color-ink-70)]">
                {linkAccess}
              </div>
              <button
                type="button"
                className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
              >
                Copy link
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[var(--bp-color-paper-deep)] px-3.5 py-2 text-[10.5px] text-[var(--bp-color-ink-55)] shadow-[inset_0_1px_0_var(--bp-color-rule)]">
              <UserPlus size={12} />
              Invites are local until brief access roles ship.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
