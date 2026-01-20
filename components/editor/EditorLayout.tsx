"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { EditorHeader } from "./EditorHeader";
import { EditorToolbar } from "./EditorToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { EditorProvider, useEditor } from "./EditorContext";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useToolShortcuts } from "./useToolShortcuts";
import { ToolModifiersOverlay } from "./ToolModifiersOverlay";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";

function EditorLayoutContent({ children }: { children: React.ReactNode }) {
  const {
    readOnly,
    undo,
    redo,
    setTool,
    deleteSelected,
    selectedFigureId,
    copySelection,
    paste,
    canCopy,
    canPaste,
  } = useEditor();
  const searchParams = useSearchParams();
  const embedded =
    searchParams.get("embedded") === "1" || searchParams.get("embed") === "1";

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
    onDeleteSelected: deleteSelected,
    canDeleteSelected: Boolean(selectedFigureId),
    onCopySelection: copySelection,
    canCopy,
    onPaste: paste,
    canPaste,
    enabled: !embedded && !readOnly,
  });

  useToolShortcuts({
    setTool,
    enabled: !embedded && !readOnly,
  });

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-text-main dark:text-text-main-dark transition-colors duration-200 selection:bg-primary selection:text-white">
      <PresenceHeartbeat />
      {embedded ? null : <EditorHeader />}
      <main className="flex-1 flex overflow-hidden">
        <EditorToolbar />
        <div
          className={
            embedded
              ? "flex-1 relative bg-canvas-bg dark:bg-canvas-bg-dark overflow-hidden flex flex-col opacity-0 pointer-events-none select-none"
              : "flex-1 relative bg-canvas-bg dark:bg-canvas-bg-dark overflow-hidden flex flex-col"
          }
        >
          {children}
          {embedded ? null : <ToolModifiersOverlay />}
        </div>
        {embedded || readOnly ? null : <PropertiesPanel />}
      </main>
    </div>
  );
}

export function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <EditorProvider>
      <EditorLayoutContent>{children}</EditorLayoutContent>
    </EditorProvider>
  );
}
