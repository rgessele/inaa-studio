"use client";

import React, { useState } from "react";

export function ThemeToggleButton() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark(document.documentElement.classList.contains("dark"));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-accent-gold transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5 focus:outline-none"
      title={isDark ? "Modo claro" : "Modo escuro"}
    >
      <span className="material-symbols-outlined text-[20px]">
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
