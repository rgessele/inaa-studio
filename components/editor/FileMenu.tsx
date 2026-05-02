"use client";

import React, { useEffect, useRef, useState } from "react";

interface FileMenuProps {
  onSave: () => void;
  onSaveAs: () => void;
  onImportPdf: (file: File) => void | Promise<void>;
  disabled?: boolean;
  isImportingPdf?: boolean;
}

export function FileMenu({
  onSave,
  onSaveAs,
  onImportPdf,
  disabled = false,
  isImportingPdf = false,
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

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

  const handleAction = (action: () => void) => {
    if (disabled) return;
    action();
    setIsOpen(false);
  };

  const shortcutSave = isMac ? "⌘S" : "Ctrl+S";
  const shortcutSaveAs = isMac ? "⇧⌘S" : "Ctrl+Shift+S";

  const handleImportClick = () => {
    if (disabled || isImportingPdf) return;
    setIsOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await onImportPdf(file);
  };

  return (
    <div className="relative" ref={menuRef}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event);
        }}
      />
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors ${isOpen ? "bg-gray-100 dark:bg-gray-700 text-primary dark:text-white" : "text-text-muted dark:text-text-muted-dark"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        Arquivo
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50">
          <button
            className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            onClick={() => handleAction(onSave)}
          >
            <span className="flex items-center justify-between gap-3">
              <span>Salvar</span>
              <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
                {shortcutSave}
              </span>
            </span>
          </button>
          <button
            className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            onClick={() => handleAction(onSaveAs)}
          >
            <span className="flex items-center justify-between gap-3">
              <span>Salvar como...</span>
              <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
                {shortcutSaveAs}
              </span>
            </span>
          </button>
          <button
            className="w-full text-left text-xs px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleImportClick}
            disabled={disabled || isImportingPdf}
          >
            <span className="flex items-center justify-between gap-3">
              <span>{isImportingPdf ? "Importando..." : "Importar..."}</span>
              <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
                PDF
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
