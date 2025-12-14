"use client";

import React, { useEffect, useRef, useState } from "react";

interface EditMenuProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function EditMenu({ onUndo, onRedo, canUndo, canRedo }: EditMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

  const shortcutUndo = isMac ? "⌘Z" : "Ctrl+Z";
  const shortcutRedo = isMac ? "⇧⌘Z" : "Ctrl+Shift+Z / Ctrl+Y";

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

  const itemClass = (enabled: boolean) =>
    `w-full text-left text-xs px-3 py-2 rounded flex items-center justify-between gap-3 ${
      enabled
        ? "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
        : "text-gray-400 dark:text-gray-500 cursor-not-allowed"
    }`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors ${
          isOpen
            ? "bg-gray-100 dark:bg-gray-700 text-primary dark:text-white"
            : "text-text-muted dark:text-text-muted-dark"
        }`}
      >
        Editar
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50">
          <button
            className={itemClass(canUndo)}
            onClick={() => {
              if (!canUndo) return;
              onUndo();
              setIsOpen(false);
            }}
          >
            <span>Desfazer</span>
            <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
              {shortcutUndo}
            </span>
          </button>

          <button
            className={itemClass(canRedo)}
            onClick={() => {
              if (!canRedo) return;
              onRedo();
              setIsOpen(false);
            }}
          >
            <span>Refazer</span>
            <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
              {shortcutRedo}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
