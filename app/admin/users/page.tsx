import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserRowActions } from "@/components/admin/UserRowActions";
import { UsersPaginationControls } from "@/components/admin/UsersPaginationControls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function toInt(v: string | string[] | undefined, fallback: number): number {
  const s = toStr(v);
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = toStr(sp.q).trim();
  const role = toStr(sp.role).trim();
  const status = toStr(sp.status).trim();
  const online = toStr(sp.online).trim();
  const pageSize = clampInt(toInt(sp.pageSize, 50), 10, 200);
  const pageRaw = clampInt(toInt(sp.page, 1), 1, 1_000_000);

  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? "";

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const fiveMinAgo = new Date(nowMs - 5 * 60 * 1000).toISOString();

  let countQuery = supabase
    .from("admin_user_overview")
    .select("id", { count: "exact", head: true })
    .order("created_at", { ascending: false });

  let dataQuery = supabase
    .from("admin_user_overview")
    .select(
      "id, email, full_name, role, status, blocked, access_expires_at, projects_count, last_seen_at, route"
    )
    .order("created_at", { ascending: false });

  if (q) {
    countQuery = countQuery.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
    dataQuery = dataQuery.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }

  if (role) {
    countQuery = countQuery.eq("role", role);
    dataQuery = dataQuery.eq("role", role);
  }

  if (status === "blocked") {
    countQuery = countQuery.eq("blocked", true);
    dataQuery = dataQuery.eq("blocked", true);
  }

  if (status === "inactive") {
    countQuery = countQuery.eq("status", "inactive");
    dataQuery = dataQuery.eq("status", "inactive");
  }

  if (status === "expired") {
    countQuery = countQuery.lte("access_expires_at", nowIso);
    dataQuery = dataQuery.lte("access_expires_at", nowIso);
  }

  if (online === "1") {
    countQuery = countQuery.gt("last_seen_at", fiveMinAgo);
    dataQuery = dataQuery.gt("last_seen_at", fiveMinAgo);
  }

  // Pagination
  const { count: totalRaw } = await countQuery;
  const total = totalRaw ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clampInt(pageRaw, 1, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: rows, error } = await dataQuery.range(from, to);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString("pt-BR");
  };

  const fmtRelative = (iso: string | null) => {
    if (!iso) return "—";
    const ms = nowMs - new Date(iso).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  };

  const filters = (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-4">
      <form className="grid grid-cols-1 sm:grid-cols-5 gap-3" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou email"
          className="sm:col-span-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
        />
        <select
          name="role"
          defaultValue={role}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
        >
          <option value="">Role (todos)</option>
          <option value="admin">Admin</option>
          <option value="assinante">Assinante</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
        >
          <option value="">Status (todos)</option>
          <option value="blocked">Bloqueados</option>
          <option value="inactive">Inativos</option>
          <option value="expired">Expirados</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            name="online"
            value="1"
            defaultChecked={online === "1"}
            className="accent-primary"
          />
          Online (5min)
        </label>

        <div className="sm:col-span-5 flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            Filtrar
          </button>
          <Link
            href="/admin/users"
            className="text-sm text-gray-600 dark:text-gray-300 hover:underline"
          >
            Limpar
          </Link>
        </div>
      </form>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
            Usuários
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Roles, expiração, bloqueio, presença e moldes.
          </p>
        </div>
        <Link
          href="/admin/import"
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
        >
          Importar CSV
        </Link>
        <Link
          href="/admin/users/new"
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
        >
          Novo usuário
        </Link>
      </div>

      {filters}

      <UsersPaginationControls page={page} pageSize={pageSize} total={total} />

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-[11px] leading-tight">
            <thead className="bg-white/50 dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Usuário
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Role
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Expira
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Online
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Moldes
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-red-700 dark:text-red-200"
                  >
                    Erro ao carregar usuários: {error.message}
                  </td>
                </tr>
              ) : (rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-gray-600 dark:text-gray-300"
                  >
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                (rows ?? []).map((u) => {
                  const user = u as {
                    id: string;
                    email: string | null;
                    full_name: string | null;
                    role: string | null;
                    status: string | null;
                    blocked: boolean | null;
                    access_expires_at: string | null;
                    projects_count: number | null;
                    last_seen_at: string | null;
                    route: string | null;
                  };

                  const isOnline =
                    user.last_seen_at &&
                    new Date(user.last_seen_at).getTime() >
                      nowMs - 5 * 60 * 1000;

                  const primaryLabel =
                    user.full_name?.trim() || user.email || user.id;
                  const secondaryEmail =
                    user.email && user.email !== primaryLabel
                      ? user.email
                      : null;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[22rem]">
                            {primaryLabel}
                          </p>
                          {secondaryEmail ? (
                            <p className="text-gray-500 dark:text-gray-400 truncate max-w-[22rem] hidden lg:block">
                              {secondaryEmail}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                        {user.role || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {fmtDate(user.access_expires_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isOnline ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-900/30">
                              Online
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {fmtRelative(user.last_seen_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                        {String(user.projects_count ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        <UserRowActions
                          userId={user.id}
                          currentUserId={currentUserId}
                          role={user.role}
                          status={user.status}
                          blocked={Boolean(user.blocked)}
                          accessExpiresAt={user.access_expires_at}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
