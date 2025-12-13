import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

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
    .order("updated_at", { ascending: false });

  const handleSignOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Inaá Studio</h1>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-700">{user.email}</p>
              <form action={handleSignOut}>
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold text-gray-900">Seus Projetos</h2>
          <Link
            href="/editor"
            className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span className="mr-2 text-xl">+</span>
            Novo Projeto
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-red-800">Erro ao carregar projetos: {error.message}</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/editor/${project.id}`}
                className="group block rounded-lg bg-white p-6 shadow hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="mt-1 text-sm text-gray-500">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-600 transition-colors">
                    arrow_forward
                  </span>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  <p>
                    Criado em:{" "}
                    {new Date(project.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p>
                    Modificado em:{" "}
                    {new Date(project.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 shadow text-center">
            <div className="mx-auto w-24 h-24 mb-4 flex items-center justify-center rounded-full bg-gray-100">
              <span className="material-symbols-outlined text-5xl text-gray-400">
                folder_open
              </span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Nenhum projeto ainda
            </h3>
            <p className="text-gray-600 mb-6">
              Comece criando seu primeiro projeto de modelagem.
            </p>
            <Link
              href="/editor"
              className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span className="mr-2 text-xl">+</span>
              Criar Primeiro Projeto
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
