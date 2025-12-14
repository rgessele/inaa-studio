import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import { ThemeToggleButton } from "@/components/dashboard/ThemeToggleButton";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import type { Project } from "@/lib/projects";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's projects
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const handleSignOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : "Usuário");
  const email = user.email ?? "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <div className="bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 w-full bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Inaá Studio"
                className="h-9 w-auto object-contain"
              />
            </div>

            <div className="flex items-center gap-4">
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

                <div className="relative group cursor-pointer">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold shadow-subtle border-2 border-white dark:border-gray-700">
                    {initials || "U"}
                  </div>
                  <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-surface-dark" />
                </div>

                <form action={handleSignOut}>
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
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
              Seus Projetos
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Gerencie e edite seus moldes digitais.
            </p>
          </div>

          <NewProjectButton className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg shadow-lg shadow-black/20 dark:shadow-black/40 flex items-center gap-2 font-medium transition-all transform hover:-translate-y-0.5">
            <span className="material-symbols-outlined text-[22px]">add</span>
            Novo Projeto
          </NewProjectButton>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4 border border-red-200 dark:border-red-900/30">
            <p className="text-red-800 dark:text-red-200">
              Erro ao carregar projetos: {error.message}
            </p>
          </div>
        ) : (
          <DashboardClient projects={(projects ?? []) as Project[]} />
        )}
      </main>

      <footer className="mt-auto py-6 border-t border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          © 2025 Inaá Studio. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
