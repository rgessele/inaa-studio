"use client";

import React, { useState } from "react";
import { useEditor } from "./EditorContext";

export function PropertiesPanel() {
  const { selectedShapeId, shapes } = useEditor();
  const selectedShape = shapes.find((s) => s.id === selectedShapeId);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={
        "hidden lg:flex relative overflow-hidden border-l border-gray-200 dark:border-gray-700 z-10 shrink-0 transition-[width] duration-200 ease-in-out " +
        (collapsed
          ? "w-8 bg-transparent"
          : "w-72 bg-surface-light dark:bg-surface-dark shadow-subtle")
      }
    >
      <button
        type="button"
        aria-label={collapsed ? "Exibir painel" : "Recolher painel"}
        onClick={() => setCollapsed((value) => !value)}
        className={
          "absolute left-1.5 bottom-2 rounded p-1 transition-colors " +
          "z-20 " +
          "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 " +
          "hover:bg-gray-200/70 dark:hover:bg-gray-700/60"
        }
      >
        <span className="material-symbols-outlined text-[18px]">
          {collapsed ? "chevron_left" : "chevron_right"}
        </span>
      </button>

      <div
        className={
          "flex w-72 flex-col transition-all duration-200 ease-in-out " +
          (collapsed
            ? "translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100")
        }
      >
        {selectedShape ? (
          <>
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted-dark">
                Propriedades
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  more_horiz
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              <div>
                <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                      transform
                    </span>{" "}
                    Transformação
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ew-resize">
                      X
                    </span>
                    <input
                      className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary focus:border-primary text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm"
                      type="number"
                      value={Math.round(selectedShape.x)}
                      readOnly
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ns-resize">
                      Y
                    </span>
                    <input
                      className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary focus:border-primary text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm"
                      type="number"
                      value={Math.round(selectedShape.y)}
                      readOnly
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ew-resize">
                      L
                    </span>
                    <input
                      className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary focus:border-primary text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm"
                      type="number"
                      value={
                        selectedShape.width
                          ? Math.round(selectedShape.width)
                          : "-"
                      }
                      readOnly
                    />
                  </div>
                  <div className="relative group">
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-gray-400 font-bold group-hover:text-primary transition-colors cursor-ns-resize">
                      A
                    </span>
                    <input
                      className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary focus:border-primary text-gray-700 dark:text-gray-200 text-right outline-none transition-all shadow-sm"
                      type="number"
                      value={
                        selectedShape.height
                          ? Math.round(selectedShape.height)
                          : "-"
                      }
                      readOnly
                    />
                  </div>
                </div>
              </div>
              <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
              {/* Appearance section omitted for brevity, can be added later */}
            </div>
          </>
        ) : (
          <div className="p-4 text-center text-gray-500 text-xs">
            Nenhum objeto selecionado
          </div>
        )}
      </div>
    </aside>
  );
}
