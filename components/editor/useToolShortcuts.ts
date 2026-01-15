"use client";

import { useEffect } from "react";
import type { Tool } from "./types";

const TOOL_KEY_TO_TOOL: Record<string, Tool> = {
  KeyV: "select",
  KeyN: "node",
  KeyH: "pan",
  KeyR: "rectangle",
  KeyC: "circle",
  KeyL: "line",
  KeyU: "curve",
  KeyT: "text",
  KeyM: "measure",
  KeyO: "offset",
  KeyD: "dart",
  KeyF: "mirror",
  KeyG: "unfold",
};

interface UseToolShortcutsOptions {
  setTool: (tool: Tool) => void;
  enabled?: boolean;
}

export function useToolShortcuts({
  setTool,
  enabled = true,
}: UseToolShortcutsOptions) {
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
      if (isTypingElement(event.target)) return;

      // Tool shortcuts are single keys without modifiers.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const nextTool = TOOL_KEY_TO_TOOL[event.code];
      if (!nextTool) return;

      event.preventDefault();
      setTool(nextTool);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, setTool]);
}
