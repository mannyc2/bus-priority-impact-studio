import { Outlet } from "@tanstack/react-router";
import { StudioShell } from "./studio/shell.js";

export function AppShell() {
  return (
    <StudioShell>
      <Outlet />
    </StudioShell>
  );
}
