"use client";

import React, { useCallback, useEffect, useState } from "react";

export type ThemeToggleButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onClick"
> & {
  iconClassName?: string;
  onClick?: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

export function ThemeToggleButton({
  className,
  iconClassName,
  title,
  onClick,
  children,
  ...rest
}: ThemeToggleButtonProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();

    const observer = new MutationObserver(() => sync());
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = useCallback(
    (evt: React.MouseEvent<HTMLButtonElement>) => {
      const root = document.documentElement;
      const nextIsDark = !root.classList.contains("dark");
      root.classList.toggle("dark", nextIsDark);

      try {
        localStorage.setItem("theme", nextIsDark ? "dark" : "light");
      } catch {
        // ignore (private mode, storage disabled, etc.)
      }

      setIsDark(nextIsDark);
      onClick?.(evt);
    },
    [onClick]
  );

  const computedTitle = title ?? (isDark ? "Modo claro" : "Modo escuro");

  return (
    <button
      type="button"
      {...rest}
      onClick={toggleTheme}
      title={computedTitle}
      aria-label={computedTitle}
      className={[
        "p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-accent-gold transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5 focus:outline-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={["material-symbols-outlined", iconClassName ?? "text-[20px]"]
          .filter(Boolean)
          .join(" ")}
      >
        {isDark ? "light_mode" : "dark_mode"}
      </span>
      {children}
    </button>
  );
}
