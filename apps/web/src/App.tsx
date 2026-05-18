import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StudioShell } from "./studio/shell.js";

export function AppShell({ children }: { children?: ReactNode }) {
  return <StudioShell>{children ?? <Outlet />}</StudioShell>;
}
