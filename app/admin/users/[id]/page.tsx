import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserDetailActions } from "../../../../components/admin/UserDetailActions";
import { UserProjectsControls } from "@/components/admin/UserProjectsControls";
import { OpenInFullScreenWindowLink } from "@/components/admin/OpenInFullScreenWindowLink";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

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

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? "";

  const { data: user, error } = await supabase
    .from("admin_user_overview")
    .select(
      "id, email, full_name, role, status, blocked, blocked_reason, blocked_at, access_expires_at, projects_count, last_seen_at, route"
    )
    .eq("id", id)
    .single();

  if (error || !user) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <p className="text-sm text-red-700 dark:text-red-200">
          Erro ao carregar usuário.
        </p>
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          Voltar
        </Link>
      </div>
    );
  }

  const mq = toStr(sp.mq).trim();
  const pageSize = clampInt(toInt(sp.mPageSize, 50), 10, 200);
  const pageRaw = clampInt(toInt(sp.mPage, 1), 1, 1_000_000);

  let projectsCountQuery = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", id);

  let projectsDataQuery = supabase
    .from("projects")
    .select("id, name, created_at, updated_at")
    .eq("user_id", id)
    .order("updated_at", { ascending: false });

  if (mq) {
    projectsCountQuery = projectsCountQuery.ilike("name", `%${mq}%`);
    projectsDataQuery = projectsDataQuery.ilike("name", `%${mq}%`);
  }

  const { count: projectsTotalRaw } = await projectsCountQuery;
  const projectsTotal = projectsTotalRaw ?? 0;
  const projectsTotalPages = Math.max(1, Math.ceil(projectsTotal / pageSize));
  const page = clampInt(pageRaw, 1, projectsTotalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: projects } = await projectsDataQuery.range(from, to);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString("pt-BR");
  };

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

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

  const isOnline =
    user.last_seen_at &&
    new Date(user.last_seen_at).getTime() > nowMs - 5 * 60 * 1000;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
            {user.full_name || user.email || "Usuário"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user.email || id}
          </p>
        </div>
        <Link
          href="/admin/users"
          className="text-sm px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
        >
          Voltar
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Acesso
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Role</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {user.role || "—"}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Expira</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {fmtDate(user.access_expires_at)}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Status</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {user.blocked
                    ? "Bloqueado (ban)"
                    : user.status === "inactive"
                      ? "Inativo"
                      : "Ativo"}
                </p>
                {user.blocked_reason ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Motivo: {user.blocked_reason}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Online</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {isOnline ? "Online" : "—"}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {fmtRelative(user.last_seen_at)}
                  {user.route ? ` • ${user.route}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <UserDetailActions
                userId={id}
                currentUserId={currentUserId}
                email={user.email}
                role={user.role}
                status={user.status}
                blocked={Boolean(user.blocked)}
                accessExpiresAt={user.access_expires_at}
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle overflow-hidden">
            <div className="p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Moldes
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user.projects_count ?? 0} projetos
                </p>
              </div>
            </div>

            <div className="px-6 pb-4">
              <UserProjectsControls
                page={page}
                pageSize={pageSize}
                total={projectsTotal}
                query={mq}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-[11px] leading-tight">
                <thead className="bg-white/50 dark:bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Nome
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Atualizado
                    </th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Abrir
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(projects ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-10 text-center text-sm text-gray-600 dark:text-gray-300"
                      >
                        Nenhum projeto.
                      </td>
                    </tr>
                  ) : (
                    (projects ?? []).map((p) => (
                      <tr key={p.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04]">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                          {fmtDate(p.updated_at)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <OpenInFullScreenWindowLink
                            href={`/editor/${p.id}?printOnly=1`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-700 hover:text-gray-900 hover:bg-black/[0.04] dark:text-gray-200 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                            title="Abrir no editor (somente leitura)"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              open_in_new
                            </span>
                            <span className="sr-only">Visualizar</span>
                          </OpenInFullScreenWindowLink>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Identificador
            </h2>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 break-all">
              {id}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Observações
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Qualquer ação feita aqui registra auditoria.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Bloqueio derruba sessões e impede login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
