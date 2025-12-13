import { useState, useCallback } from "react";

interface HistoryState<T> {
  past: T[];
  present: T | null;
  future: T[];
}

interface UseHistoryReturn<T> {
  state: T | null;
  setState: (newState: T, saveHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
}

export function useHistory<T>(
  initialState: T | null = null
): UseHistoryReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const setState = useCallback((newState: T, saveHistory = true) => {
    if (!saveHistory) {
      // Update without saving to history (for temporary updates during drawing)
      setHistory((current) => ({
        ...current,
        present: newState,
      }));
      return;
    }

    setHistory((current) => {
      // If there's a present state, save it to past
      const newPast =
        current.present !== null
          ? [...current.past, current.present]
          : current.past;

      return {
        past: newPast,
        present: newState,
        future: [], // Clear future when new state is set
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) {
        return current;
      }

      const previous = current.past[current.past.length - 1];
      const newPast = current.past.slice(0, current.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future:
          current.present !== null
            ? [current.present, ...current.future]
            : current.future,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) {
        return current;
      }

      const next = current.future[0];
      const newFuture = current.future.slice(1);

      return {
        past:
          current.present !== null
            ? [...current.past, current.present]
            : current.past,
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory((current) => ({
      past: [],
      present: current.present,
      future: [],
    }));
  }, []);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    clearHistory,
  };
}
