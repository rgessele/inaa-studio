"use client";

import React from "react";
import { EditorHeader } from "./EditorHeader";
import { EditorToolbar } from "./EditorToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { EditorProvider, useEditor } from "./EditorContext";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function EditorLayoutContent({ children }: { children: React.ReactNode }) {
  const { undo, redo } = useEditor();

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
  });

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-text-main dark:text-text-main-dark transition-colors duration-200 selection:bg-primary selection:text-white">
      <EditorHeader />
      <main className="flex-1 flex overflow-hidden">
        <EditorToolbar />
        <div className="flex-1 relative bg-canvas-bg dark:bg-canvas-bg-dark overflow-hidden flex flex-col">
          {children}
        </div>
        <PropertiesPanel />
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
