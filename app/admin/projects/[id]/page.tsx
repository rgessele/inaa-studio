import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EditorLayout, Canvas } from "@/components/editor";
import AdminProjectLoader from "./AdminProjectLoader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProjectReadOnlyPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, design_data")
    .eq("id", id)
    .single();

  if (error || !project) {
    redirect("/admin/users");
  }

  return (
    <EditorLayout>
      <AdminProjectLoader project={project} />
      <Canvas />
    </EditorLayout>
  );
}
