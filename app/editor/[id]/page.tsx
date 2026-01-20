import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { EditorLayout, Canvas } from "@/components/editor";
import type { DesignDataV2 } from "@/components/editor/types";
import { createAdminClient } from "@/lib/supabase/admin";
import ProjectLoader from "./ProjectLoader";

function getE2ETestProject(id: string): {
  id: string;
  name: string;
  design_data: Partial<DesignDataV2>;
} {
  return {
    id,
    name: "Projeto E2E",
    design_data: {
      version: 2 as const,
      pageGuideSettings: {
        paperSize: "A4",
        orientation: "portrait",
        marginCm: 1,
      },
      guides: [],
      figures: [
        {
          id: "fig_e2e_rect",
          tool: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          closed: true,
          nodes: [
            { id: "n1", x: 0, y: 0, mode: "corner" },
            { id: "n2", x: 200, y: 0, mode: "corner" },
            { id: "n3", x: 200, y: 120, mode: "corner" },
            { id: "n4", x: 0, y: 120, mode: "corner" },
          ],
          edges: [
            { id: "e1", from: "n1", to: "n2", kind: "line" },
            { id: "e2", from: "n2", to: "n3", kind: "line" },
            { id: "e3", from: "n3", to: "n4", kind: "line" },
            { id: "e4", from: "n4", to: "n1", kind: "line" },
          ],
          stroke: "aci7",
          strokeWidth: 2,
          fill: "transparent",
          opacity: 1,
        },
      ],
    },
  };
}

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const reminded = await params;
  const id = reminded.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {};
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!project?.name) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        const admin = createAdminClient();
        const { data: anyProject } = await admin
          .from("projects")
          .select("name")
          .eq("id", id)
          .maybeSingle();

        if (anyProject?.name) {
          return { title: anyProject.name };
        }
      }
    } catch {
      // Ignore and fall back to default title.
    }

    return {};
  }

  // With the root layout template, this becomes: "Inaá Studio - <nome>"
  return { title: project.name };
}

export default async function EditorProjectPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isE2E = process.env.E2E_TESTS === "1";
  const isProd = process.env.NODE_ENV === "production";

  const { id } = await params;

  // E2E mode: allow opening the editor without auth, with a deterministic
  // fake project so we can test ProjectLoader flows.
  if (!user && isE2E && !isProd) {
    const project = getE2ETestProject(id);
    return (
      <EditorLayout>
        <ProjectLoader project={project} />
        <Canvas />
      </EditorLayout>
    );
  }

  if (!user) {
    redirect("/login");
  }

  // Fetch the project - ensure user owns it
  const { data: ownProject } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const project = ownProject;
  const adminReadOnly = !project;

  if (!project) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      redirect("/dashboard");
    }

    const admin = createAdminClient();
    const { data: anyProject } = await admin
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!anyProject) {
      redirect("/dashboard");
    }

    return (
      <EditorLayout>
        <ProjectLoader project={anyProject} readOnly={true} />
        <Canvas />
      </EditorLayout>
    );
  }

  return (
    <EditorLayout>
      <ProjectLoader project={project} readOnly={adminReadOnly} />
      <Canvas />
    </EditorLayout>
  );
}
