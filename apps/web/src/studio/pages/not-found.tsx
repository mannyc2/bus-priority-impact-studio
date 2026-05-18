import { Link } from "@tanstack/react-router";
import { StudioPage, StudioPanel } from "../page.js";

export function NotFoundPage() {
  return (
    <StudioPage>
      <StudioPanel>
        <div className="max-w-[520px]">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Not found
          </div>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[0]">Page not found</h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--bp-color-ink-70)]">
            That studio page is not part of the hard-cutover route map.
          </p>
          <Link
            to="/"
            viewTransition
            className="mt-5 inline-flex h-9 items-center rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            Back to routes
          </Link>
        </div>
      </StudioPanel>
    </StudioPage>
  );
}
