import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Canvas, EditorLayout } from "@/components/editor";

export default async function EditorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <EditorLayout>
      <Canvas />
    </EditorLayout>
  );
}
