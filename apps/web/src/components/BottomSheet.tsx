import type { ReactNode } from "react";

export function BottomSheet({ children }: { children: ReactNode }) {
  return (
    <div className="bp-bottom-sheet">
      <div className="bp-bottom-sheet__handle" />
      {children}
    </div>
  );
}
