"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEditor } from "./EditorContext";
import {
  PAPER_SIZES,
  PAPER_SIZE_LABELS,
  type PaperOrientation,
  type PaperSize,
} from "./exportSettings";

export function ViewMenu() {
  const {
    showPageGuides,
    setShowPageGuides,
    pageGuideSettings,
    setPageGuideSettings,
    measureSnapStrengthPx,
    setMeasureSnapStrengthPx,
    gridContrast,
    setGridContrast,
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
        data-testid="view-menu-button"
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
              data-testid="toggle-page-guides"
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

          {showPageGuides ? (
            <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                    Tamanho
                  </label>
                  <select
                    data-testid="page-size-select"
                    value={pageGuideSettings.paperSize}
                    onChange={(e) =>
                      setPageGuideSettings({
                        ...pageGuideSettings,
                        paperSize: e.target.value as PaperSize,
                      })
                    }
                    className="w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 text-xs text-gray-900 dark:text-white"
                  >
                    {PAPER_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {PAPER_SIZE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                    Orientação
                  </label>
                  <select
                    data-testid="page-orientation-select"
                    value={pageGuideSettings.orientation}
                    onChange={(e) =>
                      setPageGuideSettings({
                        ...pageGuideSettings,
                        orientation: e.target.value as PaperOrientation,
                      })
                    }
                    className="w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 text-xs text-gray-900 dark:text-white"
                  >
                    <option value="portrait">Retrato</option>
                    <option value="landscape">Paisagem</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-600 dark:text-gray-300">
                    Margem (cm)
                  </label>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                    {pageGuideSettings.marginCm.toFixed(1)}
                  </span>
                </div>
                <input
                  data-testid="page-margin-slider"
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={pageGuideSettings.marginCm}
                  onChange={(e) =>
                    setPageGuideSettings({
                      ...pageGuideSettings,
                      marginCm: Number(e.target.value),
                    })
                  }
                  className="mt-2 w-full"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-4 h-px bg-gray-200 dark:bg-gray-700" />

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Contraste do Grid
              </label>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                {Math.round(Math.max(0, Math.min(1, gridContrast)) * 100)}%
              </span>
            </div>
            <input
              data-testid="grid-contrast-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(Math.max(0, Math.min(1, gridContrast)) * 100)}
              onChange={(e) => setGridContrast(Number(e.target.value) / 100)}
              className="mt-2 w-full"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
              Ajuste a intensidade das linhas do quadriculado (modo claro e
              escuro).
            </p>
          </div>

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
