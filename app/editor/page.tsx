import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Canvas } from "@/components/editor";

export default async function EditorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                Inaá Studio - Editor
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/dashboard"
                className="rounded-md bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Voltar ao Dashboard
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex min-h-[calc(100vh-64px)] flex-col bg-gray-50">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900">Editor de Moldes</h2>
          <p className="mt-2 text-gray-600">
            Use as ferramentas abaixo para criar e editar seus moldes.
          </p>
        </div>

        <div className="flex flex-1 min-h-0 px-4 pb-8 sm:px-6 lg:px-8">
          <Canvas />
        </div>
      </main>
    </div>
  );
}
