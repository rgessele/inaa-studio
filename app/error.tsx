"use client";

import React, { useEffect } from "react";

export default function Error(
  props: Readonly<{
    error: Error & { digest?: string };
    reset: () => void;
  }>
) {
  const { error, reset } = props;

  useEffect(() => {
    // Surface the underlying error in devtools.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 px-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-6 shadow-subtle">
        <h1 className="text-lg font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Tente recarregar esta seção. Se continuar acontecendo, veja o console
          do navegador para mais detalhes.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-md text-sm font-medium"
          >
            Recarregar página
          </button>
        </div>
      </div>
    </div>
  );
}
