import { Card } from "./Card.js";
import { Pill } from "./Pill.js";

type Props = {
  label: string;
  value: string;
  note: string;
  variant?: "neutral" | "success" | "warning";
};

export function MetricCard({ label, value, note, variant = "neutral" }: Props) {
  return (
    <Card className="bp-metric-card">
      <Pill variant={variant}>{label}</Pill>
      <strong className="bp-metric-value">{value}</strong>
      <span className="bp-metric-label">{note}</span>
    </Card>
  );
}
