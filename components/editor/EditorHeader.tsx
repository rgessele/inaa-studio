"use client";

import React from "react";
import { UnitSettings } from "./UnitSettings";

export function EditorHeader() {
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="h-12 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 shrink-0 z-20 shadow-subtle relative">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 overflow-hidden rounded bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[20px]">
              gesture
            </span>
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white uppercase">
            Inaá Studio
          </h1>
        </div>
        <div className="hidden md:flex ml-6 text-xs text-text-muted dark:text-text-muted-dark gap-1">
          <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            Arquivo
          </button>
          <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            Editar
          </button>
          <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            Objeto
          </button>
          <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            Visualizar
          </button>
          <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
            Janela
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <UnitSettings />
        <div className="flex items-center mr-2">
          <button
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            onClick={toggleTheme}
            title="Alternar Tema"
          >
            <span className="material-symbols-outlined text-[18px]">
              brightness_4
            </span>
          </button>
        </div>
        <button className="bg-primary hover:bg-primary-hover text-white text-xs font-medium px-3 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">logout</span>
          Sair
        </button>
        <div className="h-5 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
        <button
          className="relative h-8 w-8 rounded-full bg-accent-gold text-white flex items-center justify-center text-xs font-semibold shadow-sm hover:ring-2 hover:ring-offset-2 hover:ring-accent-gold dark:ring-offset-surface-dark transition-all"
          title="Perfil do Usuário"
        >
          JD
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 border-2 border-surface-light dark:border-surface-dark rounded-full"></span>
        </button>
      </div>
    </header>
  );
}
