import { useCallback, useMemo, useState } from "react";

type HistoryState<T> = {
  past: readonly T[];
  present: T;
  future: readonly T[];
};

export type History<T> = {
  present: T;
  set: (next: T | ((current: T) => T)) => void;
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * A small past/future stack — the lightweight versioning the v2 editing
 * surfaces use. There is no autosave-scrubber screen; the chrome's undo/redo
 * buttons drive this directly. Ported from authoring-v2-review.jsx `useHistory`.
 */
export function useHistory<T>(initial: T, seedPast: readonly T[] = []): History<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: seedPast,
    present: initial,
    future: [],
  });

  const set = useCallback((next: T | ((current: T) => T)) => {
    setHistory((state) => {
      const present =
        typeof next === "function" ? (next as (current: T) => T)(state.present) : next;
      if (present === state.present) return state;
      return { past: [...state.past, state.present], present, future: [] };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1] as T;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((state) => {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next as T, future: rest };
    });
  }, []);

  return useMemo(
    () => ({
      present: history.present,
      set,
      reset,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [history, set, reset, undo, redo],
  );
}
