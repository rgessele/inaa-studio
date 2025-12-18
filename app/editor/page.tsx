import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Canvas, EditorLayout } from "@/components/editor";

export default async function EditorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isE2E = process.env.E2E_TESTS === "1";
  if (!user && !isE2E) {
    redirect("/login");
  }

  return (
    <EditorLayout>
      <Canvas />
    </EditorLayout>
  );
}
