import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-5">
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-accent-gold">
        {value}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-95 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const fiveMinAgo = new Date(nowMs - 5 * 60 * 1000).toISOString();

  const [
    usersCount,
    projectsCount,
    blockedCount,
    inactiveCount,
    expiredCount,
    onlineCount,
    onlineRows,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("blocked", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "inactive"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .lte("access_expires_at", nowIso),
    supabase
      .from("user_presence")
      .select("user_id", { count: "exact", head: true })
      .gt("last_seen_at", fiveMinAgo),
    supabase
      .from("admin_user_overview")
      .select("id, email, full_name, last_seen_at, route", {
        count: "exact",
      })
      .gt("last_seen_at", fiveMinAgo)
      .order("last_seen_at", { ascending: false })
      .limit(12),
  ]);

  const online = (onlineRows.data ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    last_seen_at: string | null;
    route: string | null;
  }>;

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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
          Visão Geral
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gestão de usuários, presença e moldes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          label="Usuários"
          value={String(usersCount.count ?? 0)}
          href="/admin/users"
        />
        <StatCard
          label="Online agora (5min)"
          value={String(onlineCount.count ?? 0)}
          href="/admin/users?online=1"
        />
        <StatCard
          label="Banidos"
          value={String(blockedCount.count ?? 0)}
          href="/admin/users?status=blocked"
        />
        <StatCard
          label="Inativos"
          value={String(inactiveCount.count ?? 0)}
          href="/admin/users?status=inactive"
        />
        <StatCard
          label="Acesso expirado"
          value={String(expiredCount.count ?? 0)}
          href="/admin/users?status=expired"
        />
        <StatCard
          label="Moldes (projetos)"
          value={String(projectsCount.count ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Online agora
            </h2>
            <Link
              href="/admin/users?online=1"
              className="text-sm text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
            {online.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-6">
                Nenhum usuário online nos últimos 5 minutos.
              </p>
            ) : (
              online.map((u) => (
                <div
                  key={u.id}
                  className="py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {u.full_name || u.email || u.id}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {u.email || "—"}
                      {u.route ? ` • ${u.route}` : ""}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {fmtRelative(u.last_seen_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Atalhos
          </h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/admin/import"
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4 hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Importar usuários
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                CSV com defaults (assinante/ativo)
              </p>
            </Link>
            <Link
              href="/admin/users"
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-4 hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Gerenciar usuários
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Roles, ban, expiração e moldes
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
