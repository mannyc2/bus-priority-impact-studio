import type { ReactNode } from "react";

export function PanelHeader({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="bp-panel-header">
      <div className="bp-panel-header__text">
        <div className="bp-panel-header__title">{title}</div>
        {subtitle && <div className="bp-panel-header__subtitle">{subtitle}</div>}
        {children}
      </div>
      {onClose && (
        <button type="button" className="bp-panel-header__close" onClick={onClose}>
          &#x2715;
        </button>
      )}
    </div>
  );
}
