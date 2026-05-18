import { type ReactNode, useId, useState } from "react";

export type DiagnosisDriver = {
  index: number;
  title: string;
  detail: string;
};

export function AIDiagnosisStrip({
  body,
  emphasis,
  drivers,
  footer,
}: {
  body: ReactNode;
  emphasis?: ReactNode;
  drivers: readonly DiagnosisDriver[];
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const driversId = useId();

  return (
    <section
      className="bg-[var(--bp-color-accent-bg)] px-7 py-[11px] shadow-[inset_0_-1px_0_oklch(0.88_0.07_252)]"
      style={{ paddingBottom: open ? 16 : undefined }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-[3px] shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
          &#9670;
        </span>
        <div className="min-w-0 flex-1 text-[13px] leading-[1.55] text-[var(--bp-color-ink)]">
          <span>{body}</span>
          {emphasis ? (
            <>
              {" "}
              <span className="font-medium text-[var(--bp-color-accent)]">{emphasis}</span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={driversId}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-[3px] bg-[var(--bp-color-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white"
        >
          {open ? "Collapse" : "What explains this? →"}
        </button>
      </div>
      {open ? (
        <div id={driversId} className="mt-4 border-t border-[oklch(0.88_0.07_252)] pt-4">
          <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
            Most likely drivers - ranked by frequency in comparable cases:
          </div>
          <ol className="m-0 list-none space-y-2 p-0">
            {drivers.map((d) => (
              <li key={d.index} className="flex items-start gap-3">
                <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--bp-color-accent)]">
                  {String(d.index).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1 text-[12.5px] leading-[1.5]">
                  <span className="font-medium">{d.title}</span>{" "}
                  <span className="text-[var(--bp-color-ink-55)]">- {d.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {footer ? (
        <div className="mt-3 text-[11px] text-[var(--bp-color-ink-55)]">{footer}</div>
      ) : null}
    </section>
  );
}
