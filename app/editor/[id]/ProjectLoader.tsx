"use client";

import { useEffect } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import type { Figure } from "@/components/editor/types";

interface ProjectLoaderProps {
  project: {
    id: string;
    name: string;
    design_data: {
      figures?: Figure[];
      version?: number;
    };
  };
}

export default function ProjectLoader({ project }: ProjectLoaderProps) {
  const { loadProject } = useEditor();

  useEffect(() => {
    // Load the project when the component mounts
    if (project.design_data?.figures) {
      loadProject(project.design_data.figures, project.id, project.name);
    } else {
      loadProject([], project.id, project.name);
    }
  }, [project, loadProject]);

  return null; // This component only handles loading, no UI
}
