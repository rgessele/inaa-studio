"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const supabase = createClient();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({
          type: "error",
          text: error.message,
        });
      } else {
        setMessage({
          type: "success",
          text: "Verifique seu email para o link de acesso!",
        });
        setEmail("");
      }
    } catch (error) {
      console.error("Error sending magic link:", error);
      setMessage({
        type: "error",
        text: "Erro ao enviar email. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({
          type: "error",
          text: error.message,
        });
        setLoading(false);
      }
    } catch (error) {
      console.error("Error signing in with Google:", error);
      setMessage({
        type: "error",
        text: "Erro ao fazer login com Google. Tente novamente.",
      });
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden isolate bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors min-h-screen flex items-center justify-center px-4 before:content-[''] before:fixed before:inset-0 before:bg-[url('/dashboard-bg.png')] before:bg-right before:bg-no-repeat before:bg-[length:80%] before:opacity-10 before:pointer-events-none before:select-none before:z-0">
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-8 shadow-subtle">
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

          {message && (
            <div
              className={`rounded-md p-4 ${
                message.type === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
                  : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
              }`}
            >
              <p className="text-sm">{message.text}</p>
            </div>
          )}

          <form onSubmit={handleMagicLink} className="space-y-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
                placeholder="seu@email.com"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar Link de Acesso"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-surface-light dark:bg-surface-dark px-2 text-gray-500 dark:text-gray-400">
                Ou
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar com Google
          </button>
        </div>
      </div>
    </div>
  );
}
