"use client";

import { useEffect } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { Shape } from "@/components/editor/types";

interface ProjectLoaderProps {
  project: {
    id: string;
    name: string;
    design_data: {
      shapes: Shape[];
    };
  };
}

export default function ProjectLoader({ project }: ProjectLoaderProps) {
  const { loadProject } = useEditor();

  useEffect(() => {
    // Load the project when the component mounts
    if (project.design_data?.shapes) {
      loadProject(project.design_data.shapes, project.id, project.name);
    } else {
      loadProject([], project.id, project.name);
    }
  }, [project, loadProject]);

  return null; // This component only handles loading, no UI
}
