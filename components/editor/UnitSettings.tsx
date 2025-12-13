"use client";

import React, { useState, useRef, useEffect } from "react";
import { useEditor } from "./EditorContext";
import { PX_PER_CM, PX_PER_MM, PX_PER_IN } from "./constants";

export function UnitSettings() {
  const {
    unit,
    setUnit,
    pixelsPerUnit,
    setPixelsPerUnit,
    showRulers,
    setShowRulers,
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

  // Update pixels per unit when unit changes
  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    // Set accurate conversion constants
    if (newUnit === "cm") {
      setPixelsPerUnit(PX_PER_CM);
    } else if (newUnit === "mm") {
      setPixelsPerUnit(PX_PER_MM);
    } else if (newUnit === "in") {
      setPixelsPerUnit(PX_PER_IN);
    } else if (newUnit === "px") {
      setPixelsPerUnit(1);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1 ${isOpen ? "bg-gray-100 dark:bg-gray-700 text-primary dark:text-white" : "text-text-muted dark:text-text-muted-dark"}`}
        title="Configurações de Medida"
      >
        <span className="material-symbols-outlined text-[18px]">
          straighten
        </span>
        <span className="hidden sm:inline text-xs">Medidas</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
            Configurações de Régua
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Mostrar Réguas
              </label>
              <button
                onClick={() => setShowRulers(!showRulers)}
                className={`w-10 h-5 rounded-full relative transition-colors ${showRulers ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${showRulers ? "left-6" : "left-1"}`}
                />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                Unidade de Medida
              </label>
              <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="px">Pixels (px)</option>
                <option value="cm">Centímetros (cm)</option>
                <option value="mm">Milímetros (mm)</option>
                <option value="in">Polegadas (in)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                Escala (Pixels por Unidade)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={pixelsPerUnit}
                  onChange={(e) => setPixelsPerUnit(Number(e.target.value))}
                  min="0.1"
                  step="0.1"
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  px / {unit}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Ajuste para calibrar com o mundo real.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
