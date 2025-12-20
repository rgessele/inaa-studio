import { createClient } from "@/lib/supabase/client";
import type {
  DesignDataV2,
  Figure,
  GuideLine,
  PageGuideSettings,
} from "@/components/editor/types";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  design_data: DesignDataV2;
  created_at: string;
  updated_at: string;
}

export async function saveProject(
  projectName: string,
  figures: Figure[],
  pageGuideSettings: PageGuideSettings,
  guides: GuideLine[],
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

    const baseProjectData = {
      name: projectName,
      user_id: user.id,
    };

    if (projectId) {
      // Update existing project - preserve existing design_data (e.g., meta)
      const { data: existing, error: loadError } = await supabase
        .from("projects")
        .select("design_data")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .single();

      if (loadError) {
        console.error("Error loading project before update:", loadError);
        return { success: false, error: loadError.message };
      }

      const mergedDesignData: DesignDataV2 = {
        version: 2,
        figures,
        pageGuideSettings:
          pageGuideSettings ??
          (existing?.design_data as DesignDataV2 | undefined)?.pageGuideSettings,
        guides,
        meta: (existing?.design_data as DesignDataV2 | undefined)?.meta,
      };

      const { error } = await supabase
        .from("projects")
        .update({ ...baseProjectData, design_data: mergedDesignData })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating project:", error);
        return { success: false, error: error.message };
      }

      return { success: true, projectId };
    } else {
      // Insert new project
      const projectData = {
        ...baseProjectData,
        design_data: { version: 2, figures, pageGuideSettings, guides },
      };

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

export async function saveProjectAsCopy(
  sourceProjectId: string,
  newProjectName: string,
  figures: Figure[],
  pageGuideSettings: PageGuideSettings,
  guides: GuideLine[]
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const { data: source, error: sourceError } = await supabase
      .from("projects")
      .select("design_data")
      .eq("id", sourceProjectId)
      .eq("user_id", user.id)
      .single();

    if (sourceError) {
      console.error("Error loading source project:", sourceError);
      return { success: false, error: sourceError.message };
    }

    const designData: DesignDataV2 = {
      version: 2,
      figures,
      pageGuideSettings,
      guides,
      meta: (source?.design_data as DesignDataV2 | undefined)?.meta,
    };

    const { data, error } = await supabase
      .from("projects")
      .insert([
        {
          name: newProjectName,
          user_id: user.id,
          design_data: designData,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("Error creating project copy:", error);
      return { success: false, error: error.message };
    }

    return { success: true, projectId: data.id };
  } catch (error) {
    console.error("Unexpected error saving project as copy:", error);
    return {
      success: false,
      error: "Erro inesperado ao salvar como...",
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
      .eq("user_id", user.id)
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
      .eq("user_id", user.id)
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
