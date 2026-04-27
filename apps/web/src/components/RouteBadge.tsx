import { cn } from "../lib/cn.js";
import { colors } from "../lib/tokens.js";

type Size = "sm" | "md" | "lg";

export function RouteBadge({
  name,
  color = colors.accent,
  size = "md",
  onClick,
}: {
  name: string;
  color?: string;
  size?: Size;
  onClick?: () => void;
}) {
  const className = cn("bp-route-badge", `bp-route-badge--${size}`);
  const style = { background: color };

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick}>
        {name}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {name}
    </div>
  );
}
