import { CircleCheck, CircleDashed, CircleOff, TriangleAlert } from "lucide-react";
import type { HonestEmptyState } from "@/components/route/section-registry";

/**
 * The four honest-empty visual states (frontend §8.2). `checked_clean` is the
 * credibility feature: it asserts the detector looked and found nothing, which
 * is a claim — so it gets the affirmative styling, not the muted one.
 */
const EMPTY_COPY: Record<
  HonestEmptyState,
  { icon: typeof CircleCheck; tone: string; title: string; body: string }
> = {
  checked_clean: {
    icon: CircleCheck,
    tone: "var(--bp-color-good)",
    title: "Checked clean",
    body: "Detectors ran; no publishable signal.",
  },
  building: {
    icon: CircleDashed,
    tone: "var(--bp-color-ink-55)",
    title: "Building",
    body: "Pipeline still building.",
  },
  insufficient_data: {
    icon: CircleOff,
    tone: "var(--bp-color-ink-55)",
    title: "Thin data",
    body: "Data is too thin for a defensible result.",
  },
  blocked: {
    icon: TriangleAlert,
    tone: "var(--bp-color-bad, #b3261e)",
    title: "Blocked",
    body: "Upstream dependency failed this release.",
  },
};

export function HonestEmptySection({
  state,
  reason,
}: {
  state: HonestEmptyState;
  reason: string | null;
}) {
  const copy = EMPTY_COPY[state];
  const Icon = copy.icon;
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 py-16 text-center">
      <Icon size={28} strokeWidth={1.5} style={{ color: copy.tone }} aria-hidden />
      <div className="text-[15px] font-semibold">{copy.title}</div>
      <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-55)]">{copy.body}</p>
      {reason ? (
        <p className="m-0 font-mono text-[11px] text-[var(--bp-color-ink-55)]">{reason}</p>
      ) : null}
    </div>
  );
}
