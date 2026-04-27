import type { ReactNode } from "react";

export function InsightBox({
  title,
  children,
  color = "#F57F17",
  bgColor = "#FFF8E1",
  borderColor = "#FFE08240",
}: {
  title?: string;
  children: ReactNode;
  color?: string;
  bgColor?: string;
  borderColor?: string;
}) {
  return (
    <div className="bp-insight-box" style={{ background: bgColor, borderColor }}>
      {title && (
        <div className="bp-insight-box__title" style={{ color }}>
          {title}
        </div>
      )}
      <div className="bp-insight-box__body">{children}</div>
    </div>
  );
}
