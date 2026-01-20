"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  adminBanUser,
  adminSetUserRole,
  adminUnbanUser,
} from "@/app/admin/actions";

export function UserRowActions(props: {
  userId: string;
  currentUserId: string;
  role: string | null;
  blocked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState(props.role ?? "assinante");

  const isSelf = props.userId === props.currentUserId;

  const statusLabel = useMemo(() => {
    if (props.blocked) return "Bloqueado";
    return "Ativo";
  }, [props.blocked]);

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span
        className={
          props.blocked
            ? "text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-900/30"
            : "text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-900/30"
        }
      >
        {statusLabel}
      </span>

      <select
        value={roleDraft}
        disabled={pending || isSelf}
        className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        title={
          isSelf
            ? "Você não pode rebaixar a si mesmo"
            : "Alterar role do usuário"
        }
        onChange={(e) => {
          const nextRole = e.target.value;
          const prevRole = roleDraft;
          if (nextRole === prevRole) return;

          setError(null);
          setRoleDraft(nextRole);
          startTransition(async () => {
            try {
              await adminSetUserRole(
                props.userId,
                nextRole === "admin" ? "admin" : "assinante"
              );
            } catch (e) {
              setRoleDraft(prevRole);
              setError(e instanceof Error ? e.message : "Erro");
            }
          });
        }}
      >
        <option value="admin">Admin</option>
        <option value="assinante">Assinante</option>
      </select>

      <Link
        href={`/admin/users/${props.userId}`}
        className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
      >
        Abrir
      </Link>

      {props.blocked ? (
        <button
          type="button"
          disabled={pending}
          className="text-[11px] px-2 py-1 rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await adminUnbanUser(props.userId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erro");
              }
            });
          }}
        >
          Desbloquear
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          className="text-[11px] px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
          onClick={() => {
            const reason = window.prompt(
              "Motivo do bloqueio (opcional):",
              ""
            );
            if (reason === null) return;
            setError(null);
            startTransition(async () => {
              try {
                await adminBanUser(props.userId, reason || null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erro");
              }
            });
          }}
        >
          Bloquear
        </button>
      )}

      {error ? (
        <span className="text-xs text-red-600 dark:text-red-300 ml-2">
          {error}
        </span>
      ) : null}
    </div>
  );
}
