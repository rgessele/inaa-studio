"use client";

import React from "react";
import { useEditor } from "./EditorContext";
import { Tool } from "./types";

export function EditorToolbar() {
  const { tool, setTool, setShapes, undo, redo, canUndo, canRedo } =
    useEditor();

  const handleToolChange = (newTool: Tool) => {
    setTool(newTool);
  };

  const handleClear = () => {
    if (confirm("Tem certeza que deseja limpar tudo?")) {
      setShapes([]);
    }
  };

  return (
    <aside className="w-12 bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 flex flex-col z-10 shadow-subtle shrink-0 items-center py-4 gap-1">
      <button
        className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
        title="Salvar"
      >
        <span className="material-symbols-outlined text-[20px]">save</span>
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
          Salvar
        </span>
      </button>

      <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

      <button
        onClick={undo}
        disabled={!canUndo}
        className={`group relative flex items-center justify-center p-2 rounded transition-all ${
          !canUndo
            ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        }`}
        title="Desfazer (Ctrl+Z)"
      >
        <span className="material-symbols-outlined text-[20px]">undo</span>
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
          Desfazer (Ctrl+Z)
        </span>
      </button>

      <button
        onClick={redo}
        disabled={!canRedo}
        className={`group relative flex items-center justify-center p-2 rounded transition-all ${
          !canRedo
            ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        }`}
        title="Refazer (Ctrl+Y)"
      >
        <span className="material-symbols-outlined text-[20px]">redo</span>
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
          Refazer (Ctrl+Y)
        </span>
      </button>

      <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

      <ToolButton
        active={tool === "select"}
        onClick={() => handleToolChange("select")}
        icon="arrow_selector_tool"
        label="Selecionar (V)"
      />

      <ToolButton
        active={tool === "pan"}
        onClick={() => handleToolChange("pan")}
        icon="pan_tool"
        label="Mover (H)"
      />

      <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

      <ToolButton
        active={tool === "rectangle"}
        onClick={() => handleToolChange("rectangle")}
        icon="rectangle"
        label="Retângulo (R)"
        filled
      />

      <ToolButton
        active={tool === "circle"}
        onClick={() => handleToolChange("circle")}
        icon="circle"
        label="Círculo (C)"
        filled
      />

      <ToolButton
        active={tool === "line"}
        onClick={() => handleToolChange("line")}
        icon="horizontal_rule" // Using horizontal_rule as line icon replacement or custom svg
        label="Linha (L)"
        customIcon={
          <svg
            className="w-5 h-5 stroke-current"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <line x1="5" x2="19" y1="19" y2="5"></line>
          </svg>
        }
      />

      <ToolButton
        active={tool === "curve"}
        onClick={() => handleToolChange("curve")}
        icon="timeline"
        label="Curva (U)"
        customIcon={
          <svg
            className="w-5 h-5 stroke-current"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path d="M5 19 Q 12 5, 19 19"></path>
          </svg>
        }
      />

      <button
        className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
        title="Caneta (P)"
      >
        <span className="material-symbols-outlined text-[20px]">edit</span>
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
          Caneta (P)
        </span>
      </button>

      <div className="h-px w-6 bg-gray-200 dark:bg-gray-700 my-1"></div>

      <button
        className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
        title="Texto (T)"
      >
        <span className="material-symbols-outlined text-[20px]">
          text_fields
        </span>
      </button>
      <button
        className="group relative flex items-center justify-center p-2 rounded bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-all"
        title="Medir (M)"
      >
        <span className="material-symbols-outlined text-[20px]">
          straighten
        </span>
      </button>

      <div className="flex-1"></div>

      <button
        className="mb-2 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
        title="Limpar Tudo"
        onClick={handleClear}
      >
        <span className="material-symbols-outlined text-[20px]">delete</span>
      </button>
    </aside>
  );
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  filled?: boolean;
  customIcon?: React.ReactNode;
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  filled,
  customIcon,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center justify-center p-2 rounded transition-all ${
        active
          ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-light dark:border-primary/40 shadow-sm"
          : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      }`}
      title={label}
    >
      {customIcon ? (
        customIcon
      ) : (
        <span
          className={`material-symbols-outlined text-[20px] ${filled ? "icon-filled" : ""}`}
        >
          {icon}
        </span>
      )}
      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}
