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
  adminUpdateUserFullName,
} from "@/app/admin/actions";
import { toast } from "@/utils/toast";

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
  fullName: string | null;
  role: string | null;
  status: string | null;
  blocked: boolean;
  accessExpiresAt: string | null;
  initialRecoveryLink?: string | null;
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
  const [fullNameDraft, setFullNameDraft] = useState(props.fullName ?? "");
  const [transferEmailDraft, setTransferEmailDraft] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(
    props.initialRecoveryLink ?? null
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Ações rápidas
        </h3>

        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <label className="lg:col-span-2">
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                Nome
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  value={fullNameDraft}
                  disabled={pending}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10 disabled:opacity-50"
                  placeholder="Nome do usuário"
                  onChange={(e) => setFullNameDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={pending}
                  className="h-10 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      try {
                        await adminUpdateUserFullName(
                          props.userId,
                          fullNameDraft
                        );
                        toast("Nome atualizado", "success");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Erro");
                      }
                    });
                  }}
                >
                  Salvar
                </button>
              </div>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label>
                <span className="block text-xs text-gray-600 dark:text-gray-400">
                  Role
                </span>
                <select
                  value={roleDraft}
                  disabled={pending || isSelf}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10 disabled:opacity-50"
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

              <label>
                <span className="block text-xs text-gray-600 dark:text-gray-400">
                  Status
                </span>
                <select
                  value={statusDraft}
                  disabled={pending || isSelf}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10 disabled:opacity-50"
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
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mudanças aqui são aplicadas imediatamente.
            </p>

            {props.blocked ? (
              <button
                type="button"
                disabled={pending}
                className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-gray-900 dark:text-gray-100 text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
                className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
          </div>
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
                className="h-10 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
              Expira em (data/hora)
            </label>
            <input
              type="datetime-local"
              value={expiresDraft}
              onChange={(e) => setExpiresDraft(e.target.value)}
              className="mt-1 h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              className="h-10 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
              className="h-10 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
          Após expirar, o login é bloqueado automaticamente.
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
              className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              placeholder="aluno@exemplo.com"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            className="h-10 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
          Se o email de redefinição não estiver chegando (SMTP/deliverability),
          gere um link manual e envie por um canal seguro.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !props.email}
            className="h-10 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
              className="h-10 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors inline-flex items-center justify-center"
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
              className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
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
              className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              placeholder="novo-email@exemplo.com"
            />
          </div>
          <button
            type="button"
            disabled={pending || !transferEmailDraft.trim()}
            className="h-10 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center"
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
