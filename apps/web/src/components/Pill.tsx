import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

type Variant = "neutral" | "success" | "warning";

export function Pill({
  children,
  variant = "neutral",
  active,
  color,
  onClick,
}: {
  children: ReactNode;
  variant?: Variant;
  active?: boolean;
  /** Custom active-state background color. */
  color?: string;
  onClick?: () => void;
}) {
  const variantClass =
    variant === "success"
      ? "bp-pill-success"
      : variant === "warning"
        ? "bp-pill-warning"
        : undefined;
  const className = cn("bp-pill", variantClass, active ? "bp-pill--active" : null);
  const style =
    active && color ? { background: color, borderColor: color, color: "#fff" } : undefined;

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}
