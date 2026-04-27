import { useCallback, useEffect, useState } from "react";
import { BusPulseMap } from "./components/BusPulseMap.js";
import { ComparisonPanel } from "./components/ComparisonPanel.js";
import { DigestPanel } from "./components/DigestPanel.js";
import { HotspotsPanel } from "./components/HotspotsPanel.js";
import { Pill } from "./components/Pill.js";
import { RouteProfilePanel } from "./components/RouteProfilePanel.js";
import type { RouteData } from "./fixtures/routes.js";
import { colors, gradeColor } from "./lib/tokens.js";

type View = "hotspots" | "route" | "digest" | "compare";
type SheetState = "peek" | "full" | "hidden";

const NAV_ITEMS = [
  { id: "hotspots" as View, icon: "\uD83D\uDCCD", label: "Map" },
  { id: "digest" as View, icon: "\uD83D\uDCEC", label: "Feed" },
  { id: "compare" as View, icon: "\u2696\uFE0F", label: "Compare" },
] as const;

const FILTER_PILLS = [
  "Slow routes",
  "Bunching",
  "My routes",
  "ACE active",
  "SBS corridors",
] as const;

const GRADE_LEGEND: { grade: string; label: string }[] = [
  { grade: "A", label: "A \u2014 Great" },
  { grade: "B", label: "B \u2014 Good" },
  { grade: "C", label: "C \u2014 Fair" },
  { grade: "D", label: "D \u2014 Poor" },
];

export function App() {
  const [view, setView] = useState<View>("hotspots");
  const [selectedRoute, setSelectedRoute] = useState<{
    name: string;
    grade: string;
  } | null>(null);
  const [compareRoutes, setCompareRoutes] = useState<string[]>(["B46", "B44"]);
  const [mobileSheet, setMobileSheet] = useState<SheetState>("peek");
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [width, setWidth] = useState(window.innerWidth);

  /* Responsive breakpoints */
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1200;
  const isDesktop = width >= 1200;

  /* Track viewport width */
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Handlers */
  const handleRouteClick = useCallback(
    (route: RouteData | { name: string; grade: string }) => {
      setSelectedRoute({ name: route.name, grade: route.grade });
      setView("route");
      if (isMobile) setMobileSheet("full");
    },
    [isMobile],
  );

  const handleMapRouteClick = useCallback(
    (route: { name: string; grade: string }) => {
      setSelectedRoute(route);
      setView("route");
      if (isMobile) setMobileSheet("full");
    },
    [isMobile],
  );

  const handleCompare = useCallback((route: RouteData) => {
    setCompareRoutes((prev) => {
      const next = [...prev, route.name];
      return next.length > 2 ? next.slice(-2) : next;
    });
    setView("compare");
  }, []);

  const handleClose = useCallback(() => {
    setView("hotspots");
    setSelectedRoute(null);
    if (isMobile) setMobileSheet("peek");
  }, [isMobile]);

  /* Panel renderer */
  const compact = isMobile || isTablet;

  function renderPanel() {
    switch (view) {
      case "hotspots":
        return (
          <HotspotsPanel
            onRouteClick={handleRouteClick}
            compact={compact}
            hoveredRoute={hoveredRoute}
            onHoverRoute={setHoveredRoute}
          />
        );
      case "route":
        return (
          <RouteProfilePanel
            route={selectedRoute}
            onClose={handleClose}
            onCompare={handleCompare}
            compact={compact}
          />
        );
      case "digest":
        return (
          <DigestPanel
            onRouteClick={(r) => handleRouteClick({ ...r, grade: "" })}
            compact={compact}
            onHoverRoute={setHoveredRoute}
          />
        );
      case "compare":
        return <ComparisonPanel routes={compareRoutes} onClose={handleClose} compact={compact} />;
    }
  }

  /* ── Mobile layout ── */
  if (isMobile) {
    const sheetHeight =
      mobileSheet === "full" ? "calc(100% - 56px)" : mobileSheet === "peek" ? "240px" : "0px";

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          background: colors.surface,
        }}
      >
        {/* Search bar */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 10,
            height: 44,
            background: colors.white,
            borderRadius: 9999,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>{"\uD83D\uDD0D"}</span>
          <span style={{ color: colors.muted, fontSize: 15 }}>
            Search routes, stops, corridors...
          </span>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: "relative" }}>
          <BusPulseMap
            onRouteClick={handleMapRouteClick}
            onRouteHover={setHoveredRoute}
            activeRoute={selectedRoute?.name ?? null}
            hoveredRoute={hoveredRoute}
          />
        </div>

        {/* Bottom sheet */}
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 0,
            right: 0,
            height: sheetHeight,
            background: colors.white,
            borderRadius: "20px 20px 0 0",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
            zIndex: 8,
            transition: "height 0.3s ease",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Drag handle */}
          <button
            type="button"
            aria-expanded={mobileSheet === "full"}
            aria-label="Toggle route panel"
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              padding: "10px 0 6px",
              cursor: "pointer",
              background: "none",
              border: "none",
            }}
            onClick={() => setMobileSheet((s) => (s === "full" ? "peek" : "full"))}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: colors.light,
              }}
            />
          </button>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>{renderPanel()}</div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            height: 56,
            flexShrink: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            background: colors.white,
            borderTop: `1px solid ${colors.light}`,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = view === item.id || (view === "route" && item.id === "hotspots");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  setMobileSheet("peek");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: active ? colors.accent : colors.muted,
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  padding: "4px 16px",
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Desktop / Tablet layout ── */
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: colors.surface,
      }}
    >
      {/* Map container */}
      <div style={{ flex: 1, position: "relative" }}>
        <BusPulseMap
          onRouteClick={handleMapRouteClick}
          onRouteHover={setHoveredRoute}
          activeRoute={selectedRoute?.name ?? null}
          hoveredRoute={hoveredRoute}
        />

        {/* Floating search bar */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: isDesktop ? 72 : 16,
            zIndex: 5,
            height: 48,
            maxWidth: 420,
            width: "calc(100% - 160px)",
            background: colors.white,
            borderRadius: 9999,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>{"\uD83D\uDD0D"}</span>
          <span style={{ color: colors.muted, fontSize: 15 }}>
            Search routes, stops, corridors...
          </span>
        </div>

        {/* Filter pills */}
        <div
          style={{
            position: "absolute",
            top: 76,
            left: isDesktop ? 72 : 16,
            zIndex: 5,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {FILTER_PILLS.map((label, i) => (
            <Pill key={label} active={i === 0}>
              {label}
            </Pill>
          ))}
        </div>

        {/* Nav rail (desktop only) */}
        {isDesktop && (
          <div
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 5,
              background: colors.white,
              borderRadius: 14,
              boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
              display: "flex",
              flexDirection: "column",
              padding: 6,
              gap: 4,
            }}
          >
            {NAV_ITEMS.map((item) => {
              const active = view === item.id || (view === "route" && item.id === "hotspots");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? "#f0f4ff" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 20,
                    padding: 0,
                  }}
                  title={item.label}
                >
                  {item.icon}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: isDesktop ? 72 : 16,
            zIndex: 5,
            background: colors.white,
            borderRadius: 12,
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            padding: "10px 14px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontSize: 12,
            color: colors.slate,
          }}
        >
          {GRADE_LEGEND.map((g) => (
            <div key={g.grade} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: gradeColor(g.grade),
                }}
              />
              <span>{g.label}</span>
            </div>
          ))}
        </div>

        {/* Floating panel (desktop) */}
        {isDesktop && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 380,
              height: "calc(100% - 32px)",
              background: colors.white,
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              zIndex: 5,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{renderPanel()}</div>
          </div>
        )}
      </div>

      {/* Sidebar panel (tablet) */}
      {isTablet && (
        <div
          style={{
            width: 340,
            height: "100%",
            background: colors.white,
            borderLeft: `1px solid ${colors.light}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Tablet nav tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${colors.light}`,
              flexShrink: 0,
            }}
          >
            {NAV_ITEMS.map((item) => {
              const active = view === item.id || (view === "route" && item.id === "hotspots");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "12px 0",
                    background: "none",
                    border: "none",
                    borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
                    cursor: "pointer",
                    color: active ? colors.accent : colors.muted,
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{renderPanel()}</div>
        </div>
      )}
    </div>
  );
}
