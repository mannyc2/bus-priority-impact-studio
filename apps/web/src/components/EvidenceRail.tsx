import { Card } from "./Card.js";
import { Pill } from "./Pill.js";

type EvidenceItem = {
  title: string;
  body: string;
  variant: "neutral" | "success" | "warning";
};

const items: readonly EvidenceItem[] = [
  {
    title: "Speed and travel-time hotspots",
    body: "Segment-level speed artifacts identify where a route repeatedly loses time by month, direction, day type, and hour.",
    variant: "success",
  },
  {
    title: "Intervention overlap",
    body: "ACE routes, bus-lane geography, and planned-change context help separate likely street constraints from ordinary variance.",
    variant: "neutral",
  },
  {
    title: "Caveats remain visible",
    body: "The MVP should label inferred recommendations and missing data instead of pretending public data can answer everything.",
    variant: "warning",
  },
];

export function EvidenceRail() {
  return (
    <Card>
      <Pill>Evidence model</Pill>
      <ul className="bp-evidence-list">
        {items.map((item) => (
          <li className="bp-evidence-item" key={item.title}>
            <Pill variant={item.variant}>{item.variant}</Pill>
            <p className="bp-evidence-title">{item.title}</p>
            <p className="bp-evidence-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
