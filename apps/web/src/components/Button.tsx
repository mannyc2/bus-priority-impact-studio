import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn("bp-btn", `bp-btn--${variant}`, `bp-btn--${size}`)}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
