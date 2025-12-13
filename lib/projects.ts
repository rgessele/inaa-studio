import { createClient } from "@/lib/supabase/client";
import { Shape } from "@/components/editor/types";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  design_data: {
    shapes: Shape[];
  };
  created_at: string;
  updated_at: string;
}

export async function saveProject(
  projectName: string,
  shapes: Shape[],
  projectId: string | null = null
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  try {
    const supabase = createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const projectData = {
      name: projectName,
      design_data: { shapes },
      user_id: user.id,
    };

    if (projectId) {
      // Update existing project
      const { error } = await supabase
        .from("projects")
        .update(projectData)
        .eq("id", projectId);

      if (error) {
        console.error("Error updating project:", error);
        return { success: false, error: error.message };
      }

      return { success: true, projectId };
    } else {
      // Insert new project
      const { data, error } = await supabase
        .from("projects")
        .insert([projectData])
        .select("id")
        .single();

      if (error) {
        console.error("Error creating project:", error);
        return { success: false, error: error.message };
      }

      return { success: true, projectId: data.id };
    }
  } catch (error) {
    console.error("Unexpected error saving project:", error);
    return {
      success: false,
      error: "Erro inesperado ao salvar projeto",
    };
  }
}

export async function loadProject(
  projectId: string
): Promise<{ success: boolean; project?: Project; error?: string }> {
  try {
    const supabase = createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("Error loading project:", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Projeto não encontrado" };
    }

    return { success: true, project: data as Project };
  } catch (error) {
    console.error("Unexpected error loading project:", error);
    return {
      success: false,
      error: "Erro inesperado ao carregar projeto",
    };
  }
}

export async function listProjects(): Promise<{
  success: boolean;
  projects?: Project[];
  error?: string;
}> {
  try {
    const supabase = createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error listing projects:", error);
      return { success: false, error: error.message };
    }

    return { success: true, projects: data as Project[] };
  } catch (error) {
    console.error("Unexpected error listing projects:", error);
    return {
      success: false,
      error: "Erro inesperado ao listar projetos",
    };
  }
}
