"use client";

import { useEffect } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import type { DesignDataV2 } from "@/components/editor/types";

export default function AdminProjectLoader(props: {
  project: {
    id: string;
    name: string;
    design_data: Partial<DesignDataV2> | null;
  };
}) {
  const { loadProject, setReadOnly } = useEditor();

  useEffect(() => {
    setReadOnly(true);

    const figures = props.project.design_data?.figures ?? [];
    const pageGuideSettings = props.project.design_data?.pageGuideSettings;
    const guides = props.project.design_data?.guides ?? [];
    const meta = props.project.design_data?.meta;
    loadProject(
      figures,
      props.project.id,
      props.project.name,
      pageGuideSettings,
      guides,
      meta
    );
  }, [props.project, loadProject, setReadOnly]);

  return null;
}
