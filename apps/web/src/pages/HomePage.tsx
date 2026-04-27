import { BottomSheet } from "../components/BottomSheet.js";
import { GradeBadge } from "../components/GradeBadge.js";
import { MapPlaceholder } from "../components/MapPlaceholder.js";
import { Pill } from "../components/Pill.js";
import { SearchBar } from "../components/SearchBar.js";
import { TabBar } from "../components/TabBar.js";

const hotspots = [
  { route: "B46", issue: "Severe bunching on Utica Ave", grade: "D" },
  { route: "Q58", issue: "Slow PM peak, Myrtle\u2013Fresh Pond", grade: "C" },
  { route: "B44", issue: "3 min behind schedule", grade: "B" },
] as const;

const filters = ["Slow", "Bunching", "My Routes", "ACE Active", "SBS"] as const;

export function HomePage() {
  return (
    <div className="bp-pulse-home">
      {/* Floating search */}
      <div className="bp-pulse-home__search">
        <SearchBar />
      </div>

      {/* Filter pills */}
      <div className="bp-pulse-home__filters">
        {filters.map((f, i) => (
          <Pill key={f} active={i === 0} color="#FF4D3A" onClick={() => {}}>
            {f}
          </Pill>
        ))}
      </div>

      {/* Full-bleed map */}
      <MapPlaceholder />

      {/* Bottom sheet — peek state */}
      <BottomSheet>
        <h2 className="bp-pulse-home__sheet-title">Nearby hotspots</h2>
        <ul className="bp-pulse-home__hotspots">
          {hotspots.map((h) => (
            <li key={h.route} className="bp-pulse-home__hotspot">
              <GradeBadge grade={h.grade} size={40} />
              <div className="bp-pulse-home__hotspot-text">
                <strong>{h.route}</strong>
                <span>{h.issue}</span>
              </div>
            </li>
          ))}
        </ul>
      </BottomSheet>

      {/* Tab bar */}
      <TabBar active={0} />
    </div>
  );
}
