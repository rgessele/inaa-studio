import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EditorLayout, Canvas } from "@/components/editor";
import ProjectLoader from "./ProjectLoader";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditorProjectPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  // Fetch the project - ensure user owns it
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    redirect("/dashboard");
  }

  return (
    <EditorLayout>
      <ProjectLoader project={project} />
      <Canvas />
    </EditorLayout>
  );
}
