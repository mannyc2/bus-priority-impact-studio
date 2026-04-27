import { cn } from "../lib/cn.js";

const tabs = [
  { icon: "\u{1F4CD}", label: "Map" },
  { icon: "\u{1F4EC}", label: "Feed" },
  { icon: "\u2696\uFE0F", label: "Compare" },
] as const;

export function TabBar({ active = 0 }: { active?: number }) {
  return (
    <nav className="bp-tab-bar" aria-label="Main navigation">
      {tabs.map((tab, i) => (
        <button
          key={tab.label}
          className={cn("bp-tab-bar__item", i === active ? "bp-tab-bar__item--active" : null)}
          type="button"
          aria-current={i === active ? "page" : undefined}
        >
          <span className="bp-tab-bar__icon">{tab.icon}</span>
          <span className="bp-tab-bar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
