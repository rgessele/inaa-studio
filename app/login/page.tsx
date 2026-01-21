import Link from "next/link";
import { loginWithPassword } from "@/app/login/actions";
import { LoginToasts } from "@/components/auth/LoginToasts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const reason = toStr(sp.reason).trim();
  const error = toStr(sp.error).trim();

  return (
    <div className="relative overflow-hidden isolate bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors min-h-screen flex items-center justify-center px-4 before:content-[''] before:fixed before:inset-0 before:bg-[url('/dashboard-bg.png')] before:bg-right before:bg-no-repeat before:bg-[length:80%] before:opacity-10 before:pointer-events-none before:select-none before:z-0">
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-8 shadow-subtle">
          <LoginToasts reason={reason || undefined} error={error || undefined} />
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Inaá Studio"
              className="mx-auto h-14 w-auto object-contain"
            />
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Faça login para acessar seus projetos
            </p>
          </div>

          <form action={loginWithPassword} className="space-y-4 mt-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-50"
            >
              Entrar
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link
              href="/forgot-password"
              className="text-gray-600 dark:text-gray-300 hover:underline"
            >
              Esqueci minha senha
            </Link>
            <Link
              href="/"
              className="text-gray-600 dark:text-gray-300 hover:underline"
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
