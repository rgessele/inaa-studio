"use client";

import { useEffect } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import type { DesignDataV2 } from "@/components/editor/types";

interface ProjectLoaderProps {
  project: {
    id: string;
    name: string;
    design_data: Partial<DesignDataV2> | null;
  };
  readOnly?: boolean;
}

export default function ProjectLoader({
  project,
  readOnly,
}: ProjectLoaderProps) {
  const { loadProject, setReadOnly } = useEditor();

  useEffect(() => {
    if (readOnly) {
      setReadOnly(true);
    }
    // Load the project when the component mounts
    const figures = project.design_data?.figures ?? [];
    const pageGuideSettings = project.design_data?.pageGuideSettings;
    const guides = project.design_data?.guides ?? [];
    const meta = project.design_data?.meta;
    loadProject(
      figures,
      project.id,
      project.name,
      pageGuideSettings,
      guides,
      meta
    );
  }, [project, loadProject, readOnly, setReadOnly]);

  return null; // This component only handles loading, no UI
}
