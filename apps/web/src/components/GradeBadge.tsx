import { gradeColor } from "../lib/tokens.js";

type Size = 24 | 32 | 40 | 48 | 56 | 72;

export function GradeBadge({ grade, size = 48 }: { grade: string; size?: Size }) {
  return (
    <div
      className="bp-grade-badge"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: gradeColor(grade),
        fontSize: size * 0.5,
      }}
    >
      {grade}
    </div>
  );
}
