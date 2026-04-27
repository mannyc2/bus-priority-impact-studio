import { type ReactNode, useState } from "react";
import { colors } from "../lib/tokens.js";

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bp-collapsible">
      <button type="button" className="bp-collapsible__header" onClick={() => setOpen(!open)}>
        <div className="bp-collapsible__header-left">
          {icon && <div className="bp-collapsible__icon">{icon}</div>}
          <div>
            <div className="bp-collapsible__title" style={{ color: colors.ink }}>
              {title}
            </div>
            {subtitle && <div className="bp-collapsible__subtitle">{subtitle}</div>}
          </div>
        </div>
        <span
          className="bp-collapsible__chevron"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          &#x25BE;
        </span>
      </button>
      {open && <div className="bp-collapsible__body">{children}</div>}
    </div>
  );
}
