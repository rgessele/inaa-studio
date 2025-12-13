"use client";

import { useEffect } from "react";

interface KeyboardShortcutsOptions {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onUndo,
  onRedo,
  enabled = true,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const isTypingElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (isTypingElement(event.target)) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if (cmdOrCtrl && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z (or Cmd+Shift+Z on Mac)
      if (cmdOrCtrl && event.key === "z" && event.shiftKey) {
        event.preventDefault();
        onRedo();
        return;
      }

      // Redo: Ctrl+Y (or Cmd+Y on Mac)
      if (cmdOrCtrl && event.key === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onUndo, onRedo, enabled]);
}
