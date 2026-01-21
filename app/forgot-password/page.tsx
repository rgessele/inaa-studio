"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/utils/toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast(error.message, "error");
        return;
      }

      toast("Confira seu email para redefinir a senha.", "success");
      setEmail("");
    } catch {
      toast("Não foi possível enviar o email de redefinição.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-8 shadow-subtle">
        <h1 className="text-2xl font-bold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Informe seu email para receber um link de redefinição.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark px-3 py-2 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:border-gray-500 dark:focus:ring-gray-700"
              placeholder="seu@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>

        <div className="mt-4 text-sm">
          <Link href="/login" className="text-gray-600 dark:text-gray-300 hover:underline">
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  );
}
