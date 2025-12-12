import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
        <div className="rounded-lg bg-white p-8 shadow">
          <h2 className="text-3xl font-bold text-gray-900">
            Bem-vindo ao Dashboard!
          </h2>
          <p className="mt-4 text-gray-600">
            Você está autenticado e pode acessar seus projetos aqui.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Email: <span className="font-medium">{user.email}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            User ID: <span className="font-mono text-xs">{user.id}</span>
          </p>

          <div className="mt-8">
            <h3 className="text-xl font-semibold text-gray-900">
              Seus Projetos
            </h3>
            <p className="mt-2 text-gray-600">
              Comece a criar seus moldes usando o editor.
            </p>
            <div className="mt-4">
              <a
                href="/editor"
                className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Abrir Editor de Moldes
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
