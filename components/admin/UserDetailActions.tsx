"use client";

import { useState, useTransition } from "react";
import {
  adminBanUser,
  adminSetUserAccessExpiresAt,
  adminSetUserRole,
  adminSetUserStatus,
  adminGeneratePasswordRecoveryLink,
  adminTransferProjects,
  adminUnbanUser,
  adminUpdateUserEmail,
} from "@/app/admin/actions";

const EXPIRES_PRESETS = [
  { label: "+30 dias", days: 30 },
  { label: "+90 dias", days: 90 },
  { label: "+1 ano", days: 365 },
];

function toInputDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function UserDetailActions(props: {
  userId: string;
  currentUserId: string;
  email: string | null;
  role: string | null;
  status: string | null;
  blocked: boolean;
  accessExpiresAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSelf = props.userId === props.currentUserId;
  const [roleDraft, setRoleDraft] = useState(props.role ?? "assinante");
  const [statusDraft, setStatusDraft] = useState(props.status ?? "active");

  const [expiresDraft, setExpiresDraft] = useState(
    toInputDateTimeLocal(props.accessExpiresAt)
  );
  const [emailDraft, setEmailDraft] = useState(props.email ?? "");
  const [transferEmailDraft, setTransferEmailDraft] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Ações rápidas
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="text-xs text-gray-600 dark:text-gray-400">Role</span>
            <select
              value={roleDraft}
              disabled={pending || isSelf}
              className="text-sm px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
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
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="text-xs text-gray-600 dark:text-gray-400">Status</span>
            <select
              value={statusDraft}
              disabled={pending || isSelf}
              className="text-sm px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              title={
                isSelf
                  ? "Você não pode inativar a si mesmo"
                  : "Ativar/Inativar usuário"
              }
              onChange={(e) => {
                const nextStatus = e.target.value;
                const prevStatus = statusDraft;
                if (nextStatus === prevStatus) return;

                setError(null);
                setStatusDraft(nextStatus);
                startTransition(async () => {
                  try {
                    await adminSetUserStatus(
                      props.userId,
                      nextStatus === "inactive" ? "inactive" : "active"
                    );
                  } catch (e) {
                    setStatusDraft(prevStatus);
                    setError(e instanceof Error ? e.message : "Erro");
                  }
                });
              }}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>

          {props.blocked ? (
            <button
              type="button"
              disabled={pending}
              className="px-3 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
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
              className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
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
              Bloquear (ban)
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Expiração de acesso
        </h3>

        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {EXPIRES_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={pending}
                className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50"
                onClick={() => {
                  const iso = new Date(
                    Date.now() + p.days * 86400_000
                  ).toISOString();
                  setExpiresDraft(toInputDateTimeLocal(iso));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              access_expires_at
            </label>
            <input
              type="datetime-local"
              value={expiresDraft}
              onChange={(e) => setExpiresDraft(e.target.value)}
              className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              className="px-3 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const iso = expiresDraft
                      ? new Date(expiresDraft).toISOString()
                      : null;
                    await adminSetUserAccessExpiresAt(props.userId, iso);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Erro");
                  }
                });
              }}
            >
              Salvar
            </button>

            <button
              type="button"
              disabled={pending}
              className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50"
              onClick={() => {
                const confirm = window.confirm(
                  "Confirma remover a expiração de acesso deste usuário?"
                );
                if (!confirm) return;
                setError(null);
                startTransition(async () => {
                  try {
                    await adminSetUserAccessExpiresAt(props.userId, null);
                    setExpiresDraft("");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Erro");
                  }
                });
              }}
            >
              Remover expiração
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Quando expira, o sistema trata como ban (bloqueia login).
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Trocar email (mesma conta)
        </h3>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              Novo email
            </label>
            <input
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              placeholder="aluno@exemplo.com"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            className="px-3 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            onClick={() => {
              const confirm = window.confirm(
                "Confirma atualizar o email desta conta?"
              );
              if (!confirm) return;
              setError(null);
              startTransition(async () => {
                try {
                  await adminUpdateUserEmail(props.userId, emailDraft);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro");
                }
              });
            }}
          >
            Atualizar email
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Senha
        </h3>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Se o email de redefinição não estiver chegando (SMTP/deliverability), gere um link
          manual e envie por um canal seguro.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !props.email}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50"
            onClick={() => {
              const email = props.email;
              if (!email) return;
              setError(null);
              setRecoveryLink(null);
              startTransition(async () => {
                try {
                  const res = await adminGeneratePasswordRecoveryLink(email);
                  setRecoveryLink(res.link);

                  try {
                    await navigator.clipboard.writeText(res.link);
                  } catch {
                    // ignore
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro");
                }
              });
            }}
          >
            Gerar link de redefinição
          </button>

          {recoveryLink ? (
            <a
              href={recoveryLink}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              Abrir link
            </a>
          ) : null}
        </div>

        {recoveryLink ? (
          <div className="mt-3">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              Link (copiado para a área de transferência)
            </label>
            <input
              readOnly
              value={recoveryLink}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Migrar projetos para outro email
        </h3>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              Email destino
            </label>
            <input
              value={transferEmailDraft}
              onChange={(e) => setTransferEmailDraft(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              placeholder="novo-email@exemplo.com"
            />
          </div>
          <button
            type="button"
            disabled={pending || !transferEmailDraft.trim()}
            className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            onClick={() => {
              const confirm = window.confirm(
                "Isso transfere TODOS os projetos deste usuário. Confirmar?"
              );
              if (!confirm) return;
              const reason = window.prompt("Motivo (opcional):", "") ?? null;
              setError(null);
              startTransition(async () => {
                try {
                  await adminTransferProjects({
                    fromUserId: props.userId,
                    toEmail: transferEmailDraft,
                    reason,
                  });
                  setTransferEmailDraft("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro");
                }
              });
            }}
          >
            Transferir projetos
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Se o email destino não existir, o sistema cria um convite por email.
        </p>
      </div>

      {error ? (
        <div className="text-sm text-red-700 dark:text-red-200">{error}</div>
      ) : null}
    </div>
  );
}
