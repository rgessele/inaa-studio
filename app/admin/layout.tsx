import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggleButton } from "@/components/dashboard/ThemeToggleButton";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Best-effort bootstrap for reserved admin emails.
  try {
    await supabase.rpc("ensure_bootstrap_admin");
  } catch {
    // Ignore if RPC doesn't exist yet.
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const displayNameFromProfile = profile?.full_name?.trim() || "";
  const displayName =
    displayNameFromProfile ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Usuário";
  const email = user.email ?? "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);
  const avatarUrl = profile?.avatar_url ?? null;

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
    >
      {label}
    </Link>
  );

  return (
    <div className="relative overflow-hidden isolate bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors min-h-screen flex flex-col before:content-[''] before:fixed before:inset-0 before:bg-[url('/dashboard-bg.png')] before:bg-right before:bg-no-repeat before:bg-[length:80%] before:opacity-10 before:pointer-events-none before:select-none before:z-0">
      <PresenceHeartbeat />
      <nav className="sticky top-0 z-50 w-full bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Inaá Studio"
                  className="h-9 w-auto object-contain"
                />
                <span
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-900 dark:text-accent-gold"
                  title="Admin"
                  aria-label="Admin"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    admin_panel_settings
                  </span>
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-1">
                {navLink("/admin", "Visão Geral")}
                {navLink("/admin/users", "Usuários")}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                title="Ir para o Dashboard"
              >
                <span className="material-symbols-outlined text-[18px]">
                  dashboard
                </span>
                Dashboard
              </Link>
              <ThemeToggleButton />

              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900 dark:text-accent-gold">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {email}
                  </p>
                </div>

                <UserAvatarMenu
                  userId={user.id}
                  displayName={displayName}
                  email={email}
                  initials={initials || "A"}
                  avatarUrl={avatarUrl}
                  sizeClassName="h-10 w-10"
                  showOnlineIndicator
                />

                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="ml-2 text-red-500 hover:text-red-700 dark:text-accent-rose dark:hover:text-red-300 transition-colors"
                    title="Sair"
                  >
                    <span className="material-symbols-outlined text-[22px]">
                      logout
                    </span>
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="sm:hidden pb-3 flex gap-2">
            {navLink("/admin", "Visão Geral")}
            {navLink("/admin/users", "Usuários")}
            {navLink("/dashboard", "Dashboard")}
          </div>
        </div>
      </nav>

      <main className="relative z-10 flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {children}
      </main>

      <footer className="relative z-10 mt-auto py-6 border-t border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Admin • Inaá Studio
        </div>
      </footer>
    </div>
  );
}
