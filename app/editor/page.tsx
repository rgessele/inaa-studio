import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Canvas, EditorLayout } from "@/components/editor";

export default async function EditorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TEMPORARY: Bypass auth for testing
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const skipAuth = supabaseUrl === "http://localhost:54321";

  if (!user && !skipAuth) {
    redirect("/login");
  }

  return (
    <EditorLayout>
      <Canvas />
    </EditorLayout>
  );
}
