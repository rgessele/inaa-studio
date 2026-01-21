import { Suspense } from "react";
import { ResetPasswordClient } from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4 bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-8 shadow-subtle">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Carregando...
            </p>
          </div>
        </div>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
