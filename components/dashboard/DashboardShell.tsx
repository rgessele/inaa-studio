"use client";

import React from "react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors min-h-screen flex flex-col">
      {children}
    </div>
  );
}
