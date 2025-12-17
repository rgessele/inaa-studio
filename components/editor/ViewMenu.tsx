"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEditor } from "./EditorContext";

export function ViewMenu() {
  const {
    showPageGuides,
    setShowPageGuides,
    measureSnapStrengthPx,
    setMeasureSnapStrengthPx,
  } = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors ${isOpen ? "bg-gray-100 dark:bg-gray-700 text-primary dark:text-white" : "text-text-muted dark:text-text-muted-dark"}`}
      >
        Visualizar
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
            Visualização
          </h3>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Mostrar limites da página
            </label>
            <button
              onClick={() => setShowPageGuides(!showPageGuides)}
              className={`w-10 h-5 rounded-full relative transition-colors ${showPageGuides ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span
                className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${showPageGuides ? "left-6" : "left-1"}`}
              />
            </button>
          </div>

          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
            Usa o tamanho/orientação/margens configurados na impressão.
          </p>

          <div className="mt-4 h-px bg-gray-200 dark:bg-gray-700" />

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Força do magnetismo (Medir)
              </label>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                {Math.max(12, measureSnapStrengthPx)}px
              </span>
            </div>
            <input
              type="range"
              min={12}
              max={40}
              step={1}
              value={Math.max(12, measureSnapStrengthPx)}
              onChange={(e) => setMeasureSnapStrengthPx(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
              Aumente para facilitar o snap; mínimo 12px.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
