"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/utils/toast";

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get("code");
      if (!code) {
        setReady(true);
        return;
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast("Link inválido ou expirado.", "error");
        }
      } catch {
        toast("Link inválido ou expirado.", "error");
      } finally {
        setReady(true);
      }
    };

    void run();
  }, [searchParams, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 8) {
      toast("A senha deve ter pelo menos 8 caracteres.", "error");
      return;
    }

    if (password !== confirm) {
      toast("As senhas não coincidem.", "error");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast(error.message, "error");
        return;
      }

      toast("Senha atualizada com sucesso.", "success");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast("Não foi possível atualizar a senha.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-8 shadow-subtle">
        <h1 className="text-2xl font-bold">Definir nova senha</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Escolha uma nova senha para sua conta.
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
            Validando link...
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Nova senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Confirmar senha
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={loading}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar senha"}
            </button>
          </form>
        )}

        <div className="mt-4 text-sm">
          <Link href="/login" className="text-gray-600 dark:text-gray-300 hover:underline">
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  );
}
