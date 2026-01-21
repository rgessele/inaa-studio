import Link from "next/link";
import { redirect } from "next/navigation";

import { adminCreateUser } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default function AdminNewUserPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Novo usuário</h1>
          <p className="text-sm text-muted-foreground">
            Criar um usuário manualmente (sem signup público).
          </p>
        </div>
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <form action={adminCreateUserAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="full_name">
                Nome (display name)
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
                placeholder="Nome do usuário"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="role">
                Papel
              </label>
              <select
                id="role"
                name="role"
                defaultValue="assinante"
                className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              >
                <option value="assinante">Assinante</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="active"
                className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="access_expires_at"
              >
                Acesso expira em
              </label>
              <input
                id="access_expires_at"
                name="access_expires_at"
                type="datetime-local"
                className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="send_invite"
              name="send_invite"
              type="checkbox"
              defaultChecked
              className="h-4 w-4"
            />
            <label className="text-sm" htmlFor="send_invite">
              Enviar convite por email
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              Criar usuário
            </button>
            <p className="text-sm text-muted-foreground">
              Se você desmarcar “Enviar convite”, será gerado um link de
              recuperação após criar.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

async function adminCreateUserAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const fullName = String(formData.get("full_name") ?? "");
  const role = String(formData.get("role") ?? "assinante");
  const status = String(formData.get("status") ?? "active");
  const accessExpiresAtLocal = String(formData.get("access_expires_at") ?? "");
  const sendInvite = formData.get("send_invite") === "on";

  // datetime-local is local time without timezone; treat it as local and convert
  // to ISO by letting JS parse it on the server.
  const accessExpiresAtIso = accessExpiresAtLocal
    ? new Date(accessExpiresAtLocal).toISOString()
    : null;

  const result = await adminCreateUser({
    email,
    fullName,
    role: role === "admin" ? "admin" : "assinante",
    status: status === "inactive" ? "inactive" : "active",
    accessExpiresAtIso,
    sendInvite,
  });

  // Redirect to user details. If we have a recovery link, attach it as a query
  // param for convenient copy/paste.
  const url = new URL(`/admin/users/${result.userId}`, "http://localhost");
  if (result.recoveryLink) {
    url.searchParams.set("recovery", result.recoveryLink);
  }

  redirect(`${url.pathname}${url.search}`);
}
