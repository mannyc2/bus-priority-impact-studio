import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BusPulseMap } from "./components/BusPulseMap.js";
import type { RouteData } from "./fixtures/routes.js";
import {
  asCompareRouteName,
  asHotspotFilter,
  DEFAULT_COMPARE_ROUTES,
  DEFAULT_HOTSPOT_FILTER,
  type HotspotFilter,
  routeFromUrlId,
  routeToPathParams,
} from "./lib/route-url.js";
import { colors, gradeColor } from "./lib/tokens.js";

type View = "hotspots" | "route" | "digest" | "compare";
type SheetState = "peek" | "full" | "hidden";
type NavItemId = "hotspots" | "digest" | "compare";

type AppPanelContextValue = {
  compact: boolean;
  hoveredRoute: string | null;
  onClosePanel: () => void;
  onCompareRoute: (route: RouteData) => void;
  onHoverRoute: (name: string | null) => void;
  onRouteLinkActivate: () => void;
};

const AppPanelContext = createContext<AppPanelContextValue | null>(null);

const NAV_ITEMS: ReadonlyArray<{ id: NavItemId; icon: string; label: string }> = [
  { id: "hotspots", icon: "\uD83D\uDCCD", label: "Map" },
  { id: "digest", icon: "\uD83D\uDCEC", label: "Feed" },
  { id: "compare", icon: "\u2696\uFE0F", label: "Compare" },
];

const FILTER_LINKS: ReadonlyArray<{ id: HotspotFilter; label: string }> = [
  { id: "all", label: "All routes" },
  { id: "slow", label: "Slow routes" },
  { id: "bunching", label: "Bunching" },
  { id: "my", label: "My routes" },
];

const GRADE_LEGEND: ReadonlyArray<{ grade: string; label: string }> = [
  { grade: "A", label: "A \u2014 Great" },
  { grade: "B", label: "B \u2014 Good" },
  { grade: "C", label: "C \u2014 Fair" },
  { grade: "D", label: "D \u2014 Poor" },
];

const ROUTE_PATH_PATTERN = /^\/routes\/([^/]+)$/;

export function useAppPanelContext(): AppPanelContextValue {
  const context = useContext(AppPanelContext);
  if (context === null) {
    throw new Error("useAppPanelContext must be used inside AppShell");
  }
  return context;
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const [mobileSheet, setMobileSheet] = useState<SheetState>("peek");
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [width, setWidth] = useState(() => window.innerWidth);

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1200;
  const isDesktop = width >= 1200;
  const compact = isMobile || isTablet;
  const view = viewFromPathname(location.pathname);
  const selectedRoute = routeFromPathname(location.pathname);
  const activeRouteName = selectedRoute?.name ?? null;
  const activeFilter =
    view === "hotspots" ? asHotspotFilter(searchValue(location.search, "filter")) : null;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleRouteNavigation = useCallback(
    (route: RouteData | { name: string; grade: string }) => {
      void navigate({
        to: "/routes/$routeId",
        params: routeToPathParams(route.name),
        search: { tab: "overview" },
        viewTransition: true,
      });
      if (isMobile) setMobileSheet("full");
    },
    [isMobile, navigate],
  );

  const handleRouteLinkActivate = useCallback(() => {
    if (isMobile) setMobileSheet("full");
  }, [isMobile]);

  const handleClosePanel = useCallback(() => {
    void navigate({
      to: "/",
      search: { filter: DEFAULT_HOTSPOT_FILTER },
      viewTransition: true,
    });
    if (isMobile) setMobileSheet("peek");
  }, [isMobile, navigate]);

  const handleCompareRoute = useCallback(
    (route: RouteData) => {
      const [, currentSecondRoute] = compareRoutesFromSearch(location.search);
      void navigate({
        to: "/compare",
        search: { a: currentSecondRoute, b: route.name },
        viewTransition: true,
      });
      if (isMobile) setMobileSheet("full");
    },
    [isMobile, location.search, navigate],
  );

  const panelContext = useMemo<AppPanelContextValue>(
    () => ({
      compact,
      hoveredRoute,
      onClosePanel: handleClosePanel,
      onCompareRoute: handleCompareRoute,
      onHoverRoute: setHoveredRoute,
      onRouteLinkActivate: handleRouteLinkActivate,
    }),
    [compact, handleClosePanel, handleCompareRoute, handleRouteLinkActivate, hoveredRoute],
  );

  if (isMobile) {
    const sheetHeight =
      mobileSheet === "full" ? "calc(100% - 56px)" : mobileSheet === "peek" ? "240px" : "0px";

    return (
      <AppPanelContext.Provider value={panelContext}>
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
          <SearchChrome compact />

          <div style={{ flex: 1, position: "relative" }}>
            <BusPulseMap
              onRouteClick={handleRouteNavigation}
              onRouteHover={setHoveredRoute}
              activeRoute={activeRouteName}
              hoveredRoute={hoveredRoute}
            />
          </div>

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
              onClick={() => setMobileSheet((state) => (state === "full" ? "peek" : "full"))}
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

            <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
              <Outlet />
            </div>
          </div>

          <BottomNavigation activeView={view} onActivate={() => setMobileSheet("peek")} />
        </div>
      </AppPanelContext.Provider>
    );
  }

  return (
    <AppPanelContext.Provider value={panelContext}>
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          background: colors.surface,
        }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <BusPulseMap
            onRouteClick={handleRouteNavigation}
            onRouteHover={setHoveredRoute}
            activeRoute={activeRouteName}
            hoveredRoute={hoveredRoute}
          />

          <SearchChrome desktopOffset={isDesktop ? 72 : 16} />
          <MapFilterLinks activeFilter={activeFilter} desktopOffset={isDesktop ? 72 : 16} />

          {isDesktop && <DesktopNavigation activeView={view} />}

          <GradeLegend desktopOffset={isDesktop ? 72 : 16} />

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
              <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                <Outlet />
              </div>
            </div>
          )}
        </div>

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
            <TabletNavigation activeView={view} />
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <Outlet />
            </div>
          </div>
        )}
      </div>
    </AppPanelContext.Provider>
  );
}

function BottomNavigation({
  activeView,
  onActivate,
}: {
  activeView: View;
  onActivate: () => void;
}) {
  return (
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
      {NAV_ITEMS.map((item) => (
        <NavigationLink
          key={item.id}
          item={item}
          active={isNavItemActive(activeView, item.id)}
          variant="bottom"
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

function DesktopNavigation({ activeView }: { activeView: View }) {
  return (
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
      {NAV_ITEMS.map((item) => (
        <NavigationLink
          key={item.id}
          item={item}
          active={isNavItemActive(activeView, item.id)}
          variant="rail"
        />
      ))}
    </div>
  );
}

function TabletNavigation({ activeView }: { activeView: View }) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: `1px solid ${colors.light}`,
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map((item) => (
        <NavigationLink
          key={item.id}
          item={item}
          active={isNavItemActive(activeView, item.id)}
          variant="tablet"
        />
      ))}
    </div>
  );
}

function NavigationLink({
  item,
  active,
  variant,
  onActivate,
}: {
  item: { id: NavItemId; icon: string; label: string };
  active: boolean;
  variant: "bottom" | "rail" | "tablet";
  onActivate?: () => void;
}) {
  const style = navigationLinkStyle(active, variant);
  const content = navigationLinkContent(item, variant);

  if (item.id === "hotspots") {
    return (
      <Link
        to="/"
        search={{ filter: DEFAULT_HOTSPOT_FILTER }}
        viewTransition
        style={style}
        title={item.label}
        onClick={onActivate}
      >
        {content}
      </Link>
    );
  }

  if (item.id === "digest") {
    return (
      <Link to="/digest" viewTransition style={style} title={item.label} onClick={onActivate}>
        {content}
      </Link>
    );
  }

  return (
    <Link
      to="/compare"
      search={{ a: DEFAULT_COMPARE_ROUTES[0], b: DEFAULT_COMPARE_ROUTES[1] }}
      viewTransition
      style={style}
      title={item.label}
      onClick={onActivate}
    >
      {content}
    </Link>
  );
}

function SearchChrome({
  compact,
  desktopOffset = 16,
}: {
  compact?: boolean;
  desktopOffset?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: compact ? 12 : 16,
        left: compact ? 12 : desktopOffset,
        right: compact ? 12 : undefined,
        zIndex: 10,
        height: compact ? 44 : 48,
        maxWidth: compact ? undefined : 420,
        width: compact ? undefined : "calc(100% - 160px)",
        background: colors.white,
        borderRadius: 9999,
        display: "flex",
        alignItems: "center",
        padding: compact ? "0 16px" : "0 20px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
        gap: compact ? 8 : 10,
      }}
    >
      <span style={{ fontSize: 18 }}>{"\uD83D\uDD0D"}</span>
      <span style={{ color: colors.muted, fontSize: 15 }}>Search routes, stops, corridors...</span>
    </div>
  );
}

function MapFilterLinks({
  activeFilter,
  desktopOffset,
}: {
  activeFilter: HotspotFilter | null;
  desktopOffset: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 76,
        left: desktopOffset,
        zIndex: 5,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {FILTER_LINKS.map((filter) => {
        const active = activeFilter === filter.id;
        return (
          <Link
            key={filter.id}
            to="/"
            search={{ filter: filter.id }}
            viewTransition
            className="bp-pill"
            style={active ? activePillStyle : filterPillStyle}
          >
            {filter.label}
          </Link>
        );
      })}
    </div>
  );
}

function GradeLegend({ desktopOffset }: { desktopOffset: number }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: desktopOffset,
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
      {GRADE_LEGEND.map((grade) => (
        <div key={grade.grade} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: gradeColor(grade.grade),
            }}
          />
          <span>{grade.label}</span>
        </div>
      ))}
    </div>
  );
}

function navigationLinkContent(
  item: { icon: string; label: string },
  variant: "bottom" | "rail" | "tablet",
): ReactNode {
  if (variant === "rail") return item.icon;

  return (
    <>
      <span style={{ fontSize: variant === "bottom" ? 20 : 16 }}>{item.icon}</span>
      <span>{item.label}</span>
    </>
  );
}

function navigationLinkStyle(
  active: boolean,
  variant: "bottom" | "rail" | "tablet",
): CSSProperties {
  if (variant === "rail") {
    return {
      width: 44,
      height: 44,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: active ? "#f0f4ff" : "transparent",
      cursor: "pointer",
      fontSize: 20,
      padding: 0,
      textDecoration: "none",
    };
  }

  if (variant === "tablet") {
    return {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "12px 0",
      borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
      cursor: "pointer",
      color: active ? colors.accent : colors.muted,
      fontSize: 13,
      fontWeight: active ? 700 : 500,
      textDecoration: "none",
    };
  }

  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    cursor: "pointer",
    color: active ? colors.accent : colors.muted,
    fontSize: 10,
    fontWeight: active ? 700 : 500,
    padding: "4px 16px",
    textDecoration: "none",
  };
}

function isNavItemActive(view: View, itemId: NavItemId): boolean {
  return view === itemId || (view === "route" && itemId === "hotspots");
}

function viewFromPathname(pathname: string): View {
  if (pathname === "/digest") return "digest";
  if (pathname === "/compare") return "compare";
  if (ROUTE_PATH_PATTERN.test(pathname)) return "route";
  return "hotspots";
}

function routeFromPathname(pathname: string): RouteData | null {
  const routeId = ROUTE_PATH_PATTERN.exec(pathname)?.[1];
  return routeId ? routeFromUrlId(routeId) : null;
}

function compareRoutesFromSearch(search: unknown): [string, string] {
  return [
    asCompareRouteName(searchValue(search, "a"), DEFAULT_COMPARE_ROUTES[0]),
    asCompareRouteName(searchValue(search, "b"), DEFAULT_COMPARE_ROUTES[1]),
  ];
}

function searchValue(search: unknown, key: string): unknown {
  if (search === null || typeof search !== "object") return undefined;
  return (search as Record<string, unknown>)[key];
}

const filterPillStyle: CSSProperties = {
  textDecoration: "none",
};

const activePillStyle: CSSProperties = {
  background: colors.accent,
  borderColor: colors.accent,
  color: "#fff",
  textDecoration: "none",
};
