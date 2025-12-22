export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 px-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-6 shadow-subtle">
        <h1 className="text-lg font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          O endereço que você acessou não existe.
        </p>
      </div>
    </div>
  );
}
