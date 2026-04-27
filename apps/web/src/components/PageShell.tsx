import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="bp-page-shell">
      <header className="bp-site-header">
        <a className="bp-wordmark" href="/" aria-label="Bus Priority Impact Studio home">
          <span className="bp-wordmark-mark">BP</span>
          <span>Bus Priority Impact Studio</span>
        </a>
        <span className="bp-header-meta">Public-data prototype | MTA bus reliability</span>
      </header>
      {children}
      <footer className="bp-footer">
        Built as a public-data portfolio prototype. It is not affiliated with or endorsed by the
        MTA.
      </footer>
    </div>
  );
}
