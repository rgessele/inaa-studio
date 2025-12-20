"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/projects";
import { saveProjectAsCopy } from "@/lib/projects";
import { createDefaultExportSettings } from "@/components/editor/exportSettings";

type SortOption = "recent" | "old" | "name";
type ViewMode = "grid" | "list";

type DashboardTag = {
  id: string;
  name: string;
  color: string;
};

const DEFAULT_TAG_COLOR = "#F2C94C";
const TAGS_PAGE_SIZE = 10;

function normalizeHexColor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(prefixed);
  if (!match) return null;

  const value = match[1] ?? "";
  const expanded =
    value.length === 3
      ? `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
      : value;

  return `#${expanded.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const value = normalized.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function tagBadgeStyles(hex: string): {
  badgeStyle: React.CSSProperties;
  dotStyle: React.CSSProperties;
} {
  const rgb = hexToRgb(hex) ?? { r: 242, g: 201, b: 76 };
  const normalizedHex = normalizeHexColor(hex) ?? DEFAULT_TAG_COLOR;

  return {
    badgeStyle: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`,
      color: normalizedHex,
    },
    dotStyle: {
      backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    },
  };
}

type ProjectTagRow = {
  tag_id: string;
  tags: DashboardTag | null;
};

type DashboardProject = Project & {
  project_tags?: ProjectTagRow[];
};

function formatDatePtBr(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function getCoverUrl(project: DashboardProject): string | null {
  return project.design_data?.meta?.coverUrl ?? null;
}

function getProjectTags(project: DashboardProject): DashboardTag[] {
  const rows = project.project_tags ?? [];
  return rows
    .map((row) => row.tags)
    .filter((value): value is DashboardTag => Boolean(value))
    .map((tag) => ({
      ...tag,
      color: normalizeHexColor((tag as { color?: string | null }).color ?? "") ??
        DEFAULT_TAG_COLOR,
    }));
}

function getProjectTagIds(project: DashboardProject): string[] {
  return (project.project_tags ?? []).map((row) => row.tag_id);
}

export function DashboardClient({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [items, setItems] = useState<DashboardProject[]>(
    projects as DashboardProject[]
  );
  const [isClient, setIsClient] = useState(false);
  const [openMenuForProjectId, setOpenMenuForProjectId] = useState<
    string | null
  >(null);
  const [printProjectId, setPrintProjectId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [tags, setTags] = useState<DashboardTag[]>([]);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [tagColorDrafts, setTagColorDrafts] = useState<Record<string, string>>({});
  const [tagsPage, setTagsPage] = useState(1);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [openTagFilter, setOpenTagFilter] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [includeUntagged, setIncludeUntagged] = useState(false);
  const [tagEditorProject, setTagEditorProject] = useState<
    DashboardProject | null
  >(null);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingBannerProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const loadTags = async () => {
      setTagsError(null);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const withColor = await supabase
          .from("tags")
          .select("id, name, color")
          .order("name", { ascending: true });

        if (withColor.error?.message?.includes("color")) {
          const withoutColor = await supabase
            .from("tags")
            .select("id, name")
            .order("name", { ascending: true });

          if (withoutColor.error) {
            setTagsError(withoutColor.error.message);
            return;
          }

          const normalized = (withoutColor.data ?? []).map((tag) => {
            const row = tag as { id: string; name: string };
            return { ...row, color: DEFAULT_TAG_COLOR };
          });
          setTags(normalized);
          return;
        }

        if (withColor.error) {
          setTagsError(withColor.error.message);
          return;
        }

        const normalized = (withColor.data ?? []).map((tag) => {
          const row = tag as { id: string; name: string; color?: string | null };
          return {
            id: row.id,
            name: row.name,
            color: normalizeHexColor(row.color ?? "") ?? DEFAULT_TAG_COLOR,
          };
        });

        setTags(normalized);
      } catch {
        setTagsError("Erro inesperado ao carregar tags.");
      }
    };

    void loadTags();
  }, [isClient]);

  useEffect(() => {
    setTagColorDrafts((prev) => {
      const next = { ...prev };
      for (const tag of tags) {
        if (next[tag.id] === undefined) {
          next[tag.id] = tag.color;
        }
      }
      return next;
    });
  }, [tags]);

  useEffect(() => {
    if (!printProjectId) return;
    setOpenMenuForProjectId(null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [printProjectId]);

  useEffect(() => {
    if (!deleteCandidate) return;
    setOpenMenuForProjectId(null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteCandidate]);

  useEffect(() => {
    if (!isTagsModalOpen) return;
    setTagsPage(1);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isTagsModalOpen]);

  const tagsPageCount = useMemo(() => {
    return Math.max(1, Math.ceil(tags.length / TAGS_PAGE_SIZE));
  }, [tags.length]);

  useEffect(() => {
    setTagsPage((prev) => {
      if (prev < 1) return 1;
      if (prev > tagsPageCount) return tagsPageCount;
      return prev;
    });
  }, [tagsPageCount]);

  const pagedTags = useMemo(() => {
    const start = (tagsPage - 1) * TAGS_PAGE_SIZE;
    return tags.slice(start, start + TAGS_PAGE_SIZE);
  }, [tags, tagsPage]);

  useEffect(() => {
    if (!tagEditorProject) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [tagEditorProject]);

  useEffect(() => {
    setItems(projects as DashboardProject[]);
  }, [projects]);

  const isTagFilterActive = includeUntagged || selectedTagIds.length > 0;
  const tagFilterCount =
    selectedTagIds.length + (includeUntagged ? 1 : 0);
  const selectedTagsForChips = useMemo(() => {
    const byId = new Map(tags.map((t) => [t.id, t] as const));
    return selectedTagIds
      .map((id) => byId.get(id))
      .filter((value): value is DashboardTag => Boolean(value));
  }, [selectedTagIds, tags]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (
        typeof data === "object" &&
        data !== null &&
        (data as { type?: string }).type === "inaa:exportModalClosed"
      ) {
        setPrintProjectId(null);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-project-menu='true']")) {
        return;
      }
      if (target?.closest?.("[data-tag-filter='true']")) {
        return;
      }

      setOpenMenuForProjectId(null);
      setOpenTagFilter(false);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, []);

  const handleDuplicate = async (project: Project) => {
    const suggestedName = `${project.name} (cópia)`;
    const newName = window.prompt("Nome do projeto (cópia):", suggestedName);
    if (!newName || !newName.trim()) {
      return;
    }

    setIsWorking(true);
    try {
      const defaults = createDefaultExportSettings();
      const result = await saveProjectAsCopy(
        project.id,
        newName.trim(),
        project.design_data?.figures ?? [],
        project.design_data?.pageGuideSettings ?? {
          paperSize: defaults.paperSize,
          orientation: defaults.orientation,
          marginCm: defaults.marginCm,
        },
        project.design_data?.guides ?? []
      );

      if (!result.success || !result.projectId) {
        alert(result.error ?? "Erro ao duplicar projeto.");
        return;
      }

      const supabase = createClient();
      const withTags = await supabase
        .from("projects")
        .select(
          "*, project_tags!project_tags_project_id_fkey(tag_id, tags!project_tags_tag_id_fkey(id, name, color))"
        )
        .eq("id", result.projectId)
        .single();

      const withTagsWithoutColor =
        withTags.error?.message?.includes("color")
          ? await supabase
              .from("projects")
              .select(
                "*, project_tags!project_tags_project_id_fkey(tag_id, tags!project_tags_tag_id_fkey(id, name))"
              )
              .eq("id", result.projectId)
              .single()
          : null;

      const relationshipMissing =
        (withTagsWithoutColor?.error ?? withTags.error)?.message?.includes(
          "Could not find a relationship between 'projects' and 'project_tags'"
        ) ?? false;

      const withoutTags = relationshipMissing
        ? await supabase
            .from("projects")
            .select("*")
            .eq("id", result.projectId)
            .single()
        : null;

      const created =
        (withoutTags?.data ?? withTagsWithoutColor?.data ?? withTags.data) as unknown;
      const error =
        withoutTags?.error ?? withTagsWithoutColor?.error ?? withTags.error;

      if (error || !created) {
        router.refresh();
        return;
      }

      setItems((prev) => [created as DashboardProject, ...prev]);
      setOpenMenuForProjectId(null);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRename = async (project: Project) => {
    const newName = window.prompt("Novo nome do projeto:", project.name);
    if (!newName || !newName.trim() || newName.trim() === project.name) {
      return;
    }

    setIsWorking(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        alert("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("projects")
        .update({ name: newName.trim() })
        .eq("id", project.id)
        .eq("user_id", user.id);

      if (error) {
        alert(error.message);
        return;
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === project.id ? { ...p, name: newName.trim() } : p
        )
      );
      setOpenMenuForProjectId(null);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRemoveBanner = async (project: Project) => {
    setIsWorking(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        alert("Usuário não autenticado");
        return;
      }

      const designData = project.design_data ?? { shapes: [] };
      const meta = designData.meta ?? {};

      const { error } = await supabase
        .from("projects")
        .update({
          design_data: {
            ...designData,
            meta: {
              ...meta,
              coverUrl: null,
            },
          },
        })
        .eq("id", project.id)
        .eq("user_id", user.id);

      if (error) {
        alert(error.message);
        return;
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? {
                ...p,
                design_data: {
                  ...p.design_data,
                  meta: {
                    ...(p.design_data?.meta ?? {}),
                    coverUrl: null,
                  },
                },
              }
            : p
        )
      );
      setOpenMenuForProjectId(null);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRequestDelete = (project: Project) => {
    setDeleteError(null);
    setDeleteCandidate(project);
    setOpenMenuForProjectId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;

    setIsWorking(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setDeleteError("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", deleteCandidate.id)
        .eq("user_id", user.id);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setItems((prev) => prev.filter((p) => p.id !== deleteCandidate.id));
      setDeleteCandidate(null);
      router.refresh();
    } finally {
      setIsWorking(false);
    }
  };

  const openTagEditor = (project: DashboardProject) => {
    setTagEditorError(null);
    setTagEditorProject(project);
    setOpenMenuForProjectId(null);
  };

  const toggleTagForProject = async (projectId: string, tagId: string) => {
    setIsWorking(true);
    setTagEditorError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setTagEditorError("Usuário não autenticado");
        return;
      }

      const project = items.find((p) => p.id === projectId);
      if (!project) return;

      const current = new Set(getProjectTagIds(project));
      const willAdd = !current.has(tagId);

      if (willAdd) {
        const { error } = await supabase
          .from("project_tags")
          .insert([{ project_id: projectId, tag_id: tagId }]);
        if (error) {
          setTagEditorError(error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from("project_tags")
          .delete()
          .eq("project_id", projectId)
          .eq("tag_id", tagId);
        if (error) {
          setTagEditorError(error.message);
          return;
        }
      }

      const tag = tags.find((t) => t.id === tagId) ?? null;

      const applyToProject = (p: DashboardProject): DashboardProject => {
        const rows = p.project_tags ?? [];
        if (willAdd) {
          const nextRows: ProjectTagRow[] = tag
            ? [...rows, { tag_id: tagId, tags: tag }]
            : [...rows, { tag_id: tagId, tags: null }];
          return { ...p, project_tags: nextRows };
        }
        return { ...p, project_tags: rows.filter((row) => row.tag_id !== tagId) };
      };

      setItems((prev) => prev.map((p) => (p.id === projectId ? applyToProject(p) : p)));
      setTagEditorProject((prev) =>
        prev && prev.id === projectId ? applyToProject(prev) : prev
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || isWorking) return;

    const alreadyExists = tags.some(
      (t) => t.name.trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")
    );
    if (alreadyExists) {
      setTagsError("Já existe uma tag com esse nome.");
      return;
    }

    const normalizedColor = normalizeHexColor(newTagColor);
    if (!normalizedColor) {
      setTagsError("Cor inválida. Use o formato #RRGGBB.");
      return;
    }

    setIsWorking(true);
    setIsCreatingTag(true);
    setTagsError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setTagsError("Usuário não autenticado");
        return;
      }

      const withColor = await supabase
        .from("tags")
        .insert([{ user_id: user.id, name, color: normalizedColor }])
        .select("id, name, color")
        .single();

      const withoutColor = withColor.error?.message?.includes("color")
        ? await supabase
            .from("tags")
            .insert([{ user_id: user.id, name }])
            .select("id, name")
            .single()
        : null;

      const data =
        (withoutColor?.data
          ? {
              ...(withoutColor.data as { id: string; name: string }),
              color: DEFAULT_TAG_COLOR,
            }
          : (withColor.data as unknown)) ?? null;

      const error = withoutColor?.error ?? withColor.error;

      if (error || !data) {
        const code = (error as unknown as { code?: string } | null)?.code;
        if (
          code === "23505" ||
          error?.message?.includes("tags_user_name_unique") ||
          error?.message?.toLowerCase()?.includes("duplicate key")
        ) {
          setTagsError("Já existe uma tag com esse nome.");
          return;
        }
        if (error?.message?.includes("tags_color_check")) {
          setTagsError(
            "Atualize o banco de dados para suportar cores hex (#RRGGBB)."
          );
          return;
        }
        setTagsError(error?.message ?? "Erro ao criar tag.");
        return;
      }

      const createdRow = data as { id: string; name: string; color?: string | null };
      const created: DashboardTag = {
        id: createdRow.id,
        name: createdRow.name,
        color: normalizeHexColor(createdRow.color ?? "") ?? normalizedColor,
      };

      setTags((prev) => {
        const next = [...prev, created].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR")
        );
        const index = next.findIndex((t) => t.id === created.id);
        const page = Math.floor(Math.max(0, index) / TAGS_PAGE_SIZE) + 1;
        setTagsPage(page);
        return next;
      });
      setTagColorDrafts((prev) => ({ ...prev, [created.id]: created.color }));
      setNewTagName("");
      setNewTagColor(DEFAULT_TAG_COLOR);
    } finally {
      setIsWorking(false);
      setIsCreatingTag(false);
    }
  };

  const handleUpdateTagColor = async (tagId: string, color: string) => {
    if (isWorking) return;

    const normalizedColor = normalizeHexColor(color);
    if (!normalizedColor) {
      setTagsError("Cor inválida. Use o formato #RRGGBB.");
      return;
    }

    setIsWorking(true);
    setTagsError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setTagsError("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("tags")
        .update({ color: normalizedColor })
        .eq("id", tagId)
        .eq("user_id", user.id);

      if (error) {
        if (error.message.includes("tags_color_check")) {
          setTagsError(
            "Atualize o banco de dados para suportar cores hex (#RRGGBB)."
          );
          return;
        }
        setTagsError(error.message);
        return;
      }

      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, color: normalizedColor } : t))
      );
      setTagColorDrafts((prev) => ({ ...prev, [tagId]: normalizedColor }));

      // Keep any open tag editor consistent
      setItems((prev) =>
        prev.map((p) => ({
          ...p,
          project_tags: (p.project_tags ?? []).map((row) =>
            row.tags?.id === tagId && row.tags
              ? { ...row, tags: { ...row.tags, color: normalizedColor } }
              : row
          ),
        }))
      );
      setTagEditorProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          project_tags: (prev.project_tags ?? []).map((row) =>
            row.tags?.id === tagId && row.tags
              ? { ...row, tags: { ...row.tags, color: normalizedColor } }
              : row
          ),
        };
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (isWorking) return;

    setIsWorking(true);
    setTagsError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setTagsError("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("tags")
        .delete()
        .eq("id", tagId)
        .eq("user_id", user.id);

      if (error) {
        setTagsError(error.message);
        return;
      }

      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
      setItems((prev) =>
        prev.map((p) => ({
          ...p,
          project_tags: (p.project_tags ?? []).filter((row) => row.tag_id !== tagId),
        }))
      );
      setTagEditorProject((prev) =>
        prev
          ? {
              ...prev,
              project_tags: (prev.project_tags ?? []).filter(
                (row) => row.tag_id !== tagId
              ),
            }
          : prev
      );
    } finally {
      setIsWorking(false);
    }
  };

  const toggleSelectedTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const openBannerPicker = (projectId: string) => {
    pendingBannerProjectIdRef.current = projectId;
    fileInputRef.current?.click();
  };

  const handleBannerFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    const projectId = pendingBannerProjectIdRef.current;
    event.target.value = "";
    pendingBannerProjectIdRef.current = null;

    if (!file || !projectId) {
      return;
    }

    const project = items.find((p) => p.id === projectId);
    if (!project) {
      return;
    }

    setIsWorking(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        alert("Usuário não autenticado");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/${projectId}/cover.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("project-covers")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        alert(`Falha ao enviar banner: ${uploadError.message}`);
        return;
      }

      const coverUrl = supabase.storage
        .from("project-covers")
        .getPublicUrl(path).data.publicUrl;

      const designData = project.design_data ?? { shapes: [] };
      const meta = designData.meta ?? {};

      const { error } = await supabase
        .from("projects")
        .update({
          design_data: {
            ...designData,
            meta: {
              ...meta,
              coverUrl,
            },
          },
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (error) {
        alert(error.message);
        return;
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                design_data: {
                  ...p.design_data,
                  meta: {
                    ...(p.design_data?.meta ?? {}),
                    coverUrl,
                  },
                },
              }
            : p
        )
      );
      setOpenMenuForProjectId(null);
    } finally {
      setIsWorking(false);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const base = normalizedQuery
      ? items.filter((project) => {
          const haystack = [
            project.name,
            project.description ?? "",
            project.design_data?.meta?.notes ?? "",
            project.design_data?.meta?.fabric ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : items;

    const tagIdSet = new Set(selectedTagIds);
    const filteredByTags =
      tagIdSet.size === 0 && !includeUntagged
        ? base
        : base.filter((project) => {
            const tagIds = getProjectTagIds(project as DashboardProject);
            const isUntaggedProject = tagIds.length === 0;
            const hasSelected = tagIds.some((id) => tagIdSet.has(id));
            return (
              (includeUntagged && isUntaggedProject) ||
              (tagIdSet.size > 0 && hasSelected)
            );
          });

    const sorted = [...filteredByTags];

    if (sort === "recent") {
      sorted.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }

    if (sort === "old") {
      sorted.sort(
        (a, b) =>
          new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      );
    }

    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    return sorted;
  }, [includeUntagged, items, query, selectedTagIds, sort]);

  return (
    <>
      {isClient && printProjectId
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setPrintProjectId(null)}
              />

              <div className="relative w-[95vw] h-[90vh] max-w-6xl rounded-2xl bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 shadow-floating overflow-hidden">
                <iframe
                  title="Imprimir projeto"
                  className="w-full h-full"
                  src={`/editor/${printProjectId}?export=pdf&embedded=1`}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {isClient && deleteCandidate
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => (!isWorking ? setDeleteCandidate(null) : null)}
              />

              <div className="relative w-[92vw] max-w-lg max-h-[85vh] rounded-2xl bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 shadow-floating overflow-hidden flex flex-col">
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => (!isWorking ? setDeleteCandidate(null) : null)}
                  className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-8">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-accent-rose/15 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[24px] text-accent-rose">
                        delete
                      </span>
                    </div>

                    <div className="flex-1">
                      <h2 className="text-2xl font-semibold text-gray-900 dark:text-text-main-dark">
                        Excluir projeto
                      </h2>
                      <p className="mt-2 text-sm text-gray-600 dark:text-text-muted-dark">
                        Tem certeza que deseja excluir o projeto{" "}
                        <span className="font-medium text-gray-900 dark:text-text-main-dark">
                          “{deleteCandidate.name}”
                        </span>
                        ? Esta ação não pode ser desfeita.
                      </p>

                      {deleteError ? (
                        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 p-3 border border-red-200 dark:border-red-900/30">
                          <p className="text-sm text-red-800 dark:text-red-200">
                            {deleteError}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => setDeleteCandidate(null)}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void handleConfirmDelete()}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-accent-rose text-white hover:bg-accent-rose/90 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isWorking ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isClient && isTagsModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => (!isWorking ? setIsTagsModalOpen(false) : null)}
              />

              <div className="relative w-[92vw] max-w-lg rounded-2xl bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 shadow-floating overflow-hidden">
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => (!isWorking ? setIsTagsModalOpen(false) : null)}
                  className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-6 sm:p-8 flex flex-col min-h-0">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-text-main-dark">
                    Tags
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-text-muted-dark">
                    Crie e exclua tags para organizar seus projetos.
                  </p>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-3 items-center">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateTag();
                        }
                      }}
                      placeholder="Nome da tag"
                      className="min-w-0 h-9 border border-gray-200 dark:border-gray-700 rounded-lg px-3 bg-surface-light dark:bg-surface-dark text-sm text-gray-900 dark:text-text-main-dark placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />

                    <div className="flex items-center gap-2 justify-self-start sm:justify-self-auto">
                      <input
                        type="color"
                        aria-label="Escolher cor"
                        value={normalizeHexColor(newTagColor) ?? DEFAULT_TAG_COLOR}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="color-swatch h-9 w-9 rounded-full overflow-hidden cursor-pointer bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark"
                      />
                      <input
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateTag();
                          }
                        }}
                        onBlur={() => {
                          const normalized = normalizeHexColor(newTagColor);
                          if (normalized) setNewTagColor(normalized);
                        }}
                        placeholder="#RRGGBB"
                        inputMode="text"
                        autoCapitalize="characters"
                        className="w-24 h-9 border border-gray-200 dark:border-gray-700 rounded-lg px-3 bg-surface-light dark:bg-surface-dark text-xs font-mono text-gray-900 dark:text-text-main-dark placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isWorking || newTagName.trim().length === 0}
                      onClick={() => void handleCreateTag()}
                      className="h-9 min-w-[92px] inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isCreatingTag ? "Criando..." : "Criar"}
                    </button>
                  </div>

                  {tagsError ? (
                    <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 p-3 border border-red-200 dark:border-red-900/30">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        {tagsError}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    {tags.length === 0 ? (
                      <div className="p-6 text-sm text-gray-600 dark:text-text-muted-dark">
                        Nenhuma tag criada ainda.
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {pagedTags.map((tag) => {
                          const draft = tagColorDrafts[tag.id] ?? tag.color;
                          const normalizedDraft =
                            normalizeHexColor(draft) ?? DEFAULT_TAG_COLOR;
                          const normalizedSaved =
                            normalizeHexColor(tag.color) ?? DEFAULT_TAG_COLOR;
                          const styles = tagBadgeStyles(normalizedSaved);

                          const maybeSaveDraft = async () => {
                            const normalized = normalizeHexColor(draft);
                            if (!normalized) {
                              setTagColorDrafts((prev) => ({
                                ...prev,
                                [tag.id]: normalizedSaved,
                              }));
                              return;
                            }
                            setTagColorDrafts((prev) => ({
                              ...prev,
                              [tag.id]: normalized,
                            }));
                            if (normalized !== normalizedSaved) {
                              await handleUpdateTagColor(tag.id, normalized);
                            }
                          };

                          return (
                            <li
                              key={tag.id}
                              className="px-4 py-2"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-3 items-center">
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-[18px] text-gray-400">
                                    sell
                                  </span>
                                  <span
                                    className="min-w-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                                    style={styles.badgeStyle}
                                  >
                                    <span
                                      className="mr-1.5 h-2 w-2 rounded-full"
                                      style={styles.dotStyle}
                                    />
                                    <span className="truncate">{tag.name}</span>
                                  </span>
                                </div>

                                <input
                                  type="color"
                                  disabled={isWorking}
                                  aria-label={`Cor da tag ${tag.name}`}
                                  value={normalizedDraft}
                                  onChange={(e) => {
                                    setTagColorDrafts((prev) => ({
                                      ...prev,
                                      [tag.id]: e.target.value,
                                    }));
                                    void handleUpdateTagColor(tag.id, e.target.value);
                                  }}
                                  className="color-swatch h-9 w-9 rounded-full overflow-hidden cursor-pointer bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark disabled:opacity-60 disabled:pointer-events-none"
                                />

                                <input
                                  value={draft}
                                  disabled={isWorking}
                                  onChange={(e) =>
                                    setTagColorDrafts((prev) => ({
                                      ...prev,
                                      [tag.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => {
                                    void maybeSaveDraft();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void maybeSaveDraft();
                                    }
                                  }}
                                  placeholder="#RRGGBB"
                                  inputMode="text"
                                  autoCapitalize="characters"
                                  className="w-24 h-9 border border-gray-200 dark:border-gray-700 rounded-lg px-3 bg-surface-light dark:bg-surface-dark text-xs font-mono text-gray-900 dark:text-text-main-dark placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-60 disabled:pointer-events-none"
                                />

                                <button
                                  type="button"
                                  disabled={isWorking}
                                  onClick={() => void handleDeleteTag(tag.id)}
                                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-accent-rose hover:bg-accent-rose/10 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                                  aria-label={`Excluir tag ${tag.name}`}
                                  title="Excluir"
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    delete
                                  </span>
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {tagsPageCount > 1 ? (
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        type="button"
                        disabled={isWorking || tagsPage <= 1}
                        onClick={() => setTagsPage((p) => Math.max(1, p - 1))}
                        className="h-9 inline-flex items-center justify-center rounded-lg px-3 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        Anterior
                      </button>

                      <span className="text-xs text-gray-500 dark:text-text-muted-dark">
                        Página {tagsPage} de {tagsPageCount}
                      </span>

                      <button
                        type="button"
                        disabled={isWorking || tagsPage >= tagsPageCount}
                        onClick={() =>
                          setTagsPage((p) => Math.min(tagsPageCount, p + 1))
                        }
                        className="h-9 inline-flex items-center justify-center rounded-lg px-3 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        Próxima
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isClient && tagEditorProject
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => (!isWorking ? setTagEditorProject(null) : null)}
              />

              <div className="relative w-[92vw] max-w-lg rounded-2xl bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 shadow-floating overflow-hidden">
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => (!isWorking ? setTagEditorProject(null) : null)}
                  className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-8">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-text-main-dark">
                    Tags do projeto
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-text-muted-dark">
                    Selecione as tags para o projeto{" "}
                    <span className="font-medium text-gray-900 dark:text-text-main-dark">
                      “{tagEditorProject.name}”
                    </span>
                    .
                  </p>

                  {tagEditorError ? (
                    <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 p-3 border border-red-200 dark:border-red-900/30">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        {tagEditorError}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-6 max-h-[45vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    {tags.length === 0 ? (
                      <div className="p-6 text-sm text-gray-600 dark:text-text-muted-dark">
                        Nenhuma tag criada ainda.
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {tags.map((tag) => {
                          const checked = getProjectTagIds(tagEditorProject).includes(tag.id);
                          return (
                            <li
                              key={tag.id}
                              className="flex items-center justify-between gap-4 px-5 py-3"
                            >
                              <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isWorking}
                                  onChange={() => void toggleTagForProject(tagEditorProject.id, tag.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-text-main-dark">
                                  {tag.name}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-8 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => setTagEditorProject(null)}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className="relative z-40 flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-grow max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-[20px] text-gray-400">
              search
            </span>
          </span>
          <input
            className="block w-full h-10 pl-10 pr-3 py-0 border border-gray-200 dark:border-gray-700 rounded-md bg-surface-light dark:bg-surface-dark placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm text-gray-900 dark:text-text-main-dark shadow-subtle"
            placeholder="Buscar projetos..."
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative z-50" data-tag-filter="true">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => setOpenTagFilter((prev) => !prev)}
              className={
                "inline-flex items-center justify-center h-10 px-3 gap-2 rounded-md border bg-surface-light dark:bg-surface-dark text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-subtle disabled:opacity-60 disabled:pointer-events-none " +
                (isTagFilterActive
                  ? "border-primary ring-1 ring-primary/40"
                  : "border-gray-200 dark:border-gray-700")
              }
              aria-label="Filtrar por tags"
              title="Filtrar por tags"
            >
              <span className="material-symbols-outlined text-[20px]">sell</span>
              <span className="hidden sm:inline text-sm">Tags</span>
              {isTagFilterActive ? (
                <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-medium bg-primary/15 text-primary dark:text-primary">
                  {tagFilterCount}
                </span>
              ) : null}
            </button>

            {openTagFilter ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="absolute z-50 left-0 sm:right-0 sm:left-auto mt-2 w-72 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur shadow-floating overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/60">
                  <p className="text-sm font-medium text-gray-900 dark:text-text-main-dark">
                    Filtrar por tags
                  </p>
                  <p className="text-xs text-gray-500 dark:text-text-muted-dark mt-1">
                    Selecione uma ou mais tags.
                  </p>
                </div>

                <div className="max-h-64 overflow-auto">
                  <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeUntagged}
                      onChange={() => setIncludeUntagged((prev) => !prev)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-100">
                      Sem tag
                    </span>
                  </label>
                  <div className="h-px bg-gray-200/60 dark:bg-gray-700/60" />

                  {tags.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-600 dark:text-text-muted-dark">
                      Nenhuma tag criada ainda.
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <label
                        key={tag.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => toggleSelectedTag(tag.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-gray-200 dark:border-gray-700"
                          style={{
                            backgroundColor:
                              normalizeHexColor(tag.color) ?? DEFAULT_TAG_COLOR,
                          }}
                          aria-hidden="true"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-100">
                          {tag.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                <div className="px-4 py-3 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => {
                      setSelectedTagIds([]);
                      setIncludeUntagged(false);
                    }}
                    className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary transition-colors disabled:opacity-60 disabled:pointer-events-none"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => {
                      setIsTagsModalOpen(true);
                      setOpenTagFilter(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:pointer-events-none"
                  >
                    <span className="material-symbols-outlined text-[18px]">settings</span>
                    Gerenciar
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <select
            className="block w-full h-10 pl-3 pr-10 py-0 text-base border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-surface-light dark:bg-surface-dark text-gray-900 dark:text-text-main-dark shadow-subtle"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
          >
            <option value="recent">Mais recentes</option>
            <option value="old">Antigos</option>
            <option value="name">Nome (A-Z)</option>
          </select>

          <button
            type="button"
            onClick={() =>
              setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
            }
            className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-subtle"
            title={
              viewMode === "grid"
                ? "Alternar para lista"
                : "Alternar para grade"
            }
            aria-label={
              viewMode === "grid"
                ? "Alternar para lista"
                : "Alternar para grade"
            }
          >
            <span className="material-symbols-outlined text-[20px]">
              {viewMode === "grid" ? "view_list" : "grid_view"}
            </span>
          </button>
        </div>
      </div>

      {isTagFilterActive ? (
        <div className="-mt-5 mb-8 flex flex-wrap items-center gap-2">
          {includeUntagged ? (
            <button
              type="button"
              onClick={() => setIncludeUntagged(false)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Remover filtro: Sem tag"
            >
              <span className="text-xs">Sem tag</span>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          ) : null}

          {selectedTagsForChips.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleSelectedTag(tag.id)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title={`Remover filtro: ${tag.name}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-gray-200 dark:border-gray-700"
                style={{
                  backgroundColor:
                    normalizeHexColor(tag.color) ?? DEFAULT_TAG_COLOR,
                }}
                aria-hidden="true"
              />
              <span className="text-xs">{tag.name}</span>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setSelectedTagIds([]);
              setIncludeUntagged(false);
            }}
            className="ml-auto inline-flex items-center gap-2 h-8 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="Limpar filtros de tags"
          >
            <span className="text-xs">Limpar filtros</span>
          </button>
        </div>
      ) : null}

      <div
        className={
          viewMode === "grid"
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            : "flex flex-col gap-4"
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBannerFileSelected}
        />

        <NewProjectButton
          className={
            viewMode === "grid"
              ? "group flex flex-col items-center justify-center h-full min-h-[350px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary hover:bg-white dark:hover:bg-white/5 transition-all duration-300"
              : "group flex items-center justify-between gap-6 px-6 py-5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary hover:bg-white dark:hover:bg-white/5 transition-all duration-300"
          }
        >
          <div className="h-16 w-16 rounded-full bg-accent-gold/15 dark:bg-accent-gold/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-primary dark:text-accent-gold text-[32px]">
              add
            </span>
          </div>
          <div className={viewMode === "grid" ? "text-center" : "flex-1"}>
            <h3 className="text-lg font-medium text-gray-900 dark:text-text-main-dark">
              Criar novo design
            </h3>
            <p className="text-sm text-gray-500 dark:text-text-muted-dark mt-2">
              Comece um projeto do zero
            </p>
          </div>
        </NewProjectButton>

        {filtered.map((project) => {
          const coverUrl = getCoverUrl(project) || "/no-banner.png";
          const projectTags = getProjectTags(project);

          return (
            <Link
              key={project.id}
              href={`/editor/${project.id}`}
              className={
                viewMode === "grid"
                  ? "group bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-floating transition-all duration-300 flex flex-col"
                  : "group bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-floating transition-all duration-300 flex flex-col sm:flex-row"
              }
            >
              <div
                className={
                  viewMode === "grid"
                    ? "relative h-48 w-full bg-gray-200 dark:bg-gray-700"
                    : "relative h-28 w-full sm:w-56 sm:h-auto bg-gray-200 dark:bg-gray-700 shrink-0"
                }
              >
                <div className="absolute inset-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={project.name}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    src={coverUrl}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                </div>

                {viewMode === "grid" ? (
                  <div
                    className="absolute top-4 right-4 z-30"
                    data-project-menu="true"
                  >
                    <button
                      type="button"
                      aria-label="Ações do projeto"
                      disabled={isWorking}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuForProjectId((prev) =>
                          prev === project.id ? null : project.id
                        );
                      }}
                      className="h-9 w-9 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        more_vert
                      </span>
                    </button>

                    {openMenuForProjectId === project.id ? (
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200/20 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur shadow-floating overflow-hidden"
                      >
                        <MenuItem
                          label="Duplicar"
                          icon="content_copy"
                          disabled={isWorking}
                          onClick={() => handleDuplicate(project)}
                        />
                        <MenuItem
                          label="Renomear"
                          icon="edit"
                          disabled={isWorking}
                          onClick={() => handleRename(project)}
                        />
                        <MenuItem
                          label="Alterar banner"
                          icon="image"
                          disabled={isWorking}
                          onClick={() => openBannerPicker(project.id)}
                        />
                        <MenuItem
                          label="Remover banner"
                          icon="hide_image"
                          disabled={isWorking}
                          onClick={() => handleRemoveBanner(project)}
                        />
                        <div className="h-px bg-gray-200/60 dark:bg-gray-700/60" />
                        <MenuItem
                          label="Baixar / Imprimir"
                          icon="print"
                          disabled={isWorking}
                          onClick={() => {
                            setPrintProjectId(project.id);
                            setOpenMenuForProjectId(null);
                          }}
                        />
                        <MenuItem
                          label="Tags"
                          icon="sell"
                          disabled={isWorking}
                          onClick={() => openTagEditor(project)}
                        />
                        <div className="h-px bg-gray-200/60 dark:bg-gray-700/60" />
                        <MenuItem
                          label="Excluir"
                          icon="delete"
                          variant="danger"
                          disabled={isWorking}
                          onClick={() => handleRequestDelete(project)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div
                className={
                  viewMode === "grid"
                    ? "p-5 flex-grow flex flex-col"
                    : "p-4 flex-grow flex flex-col"
                }
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-text-main-dark group-hover:text-primary transition-colors line-clamp-1">
                    {project.name}
                  </h3>

                  {viewMode === "list" ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Duplicar"
                        aria-label="Duplicar"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleDuplicate(project);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          content_copy
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Renomear"
                        aria-label="Renomear"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleRename(project);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          edit
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Alterar banner"
                        aria-label="Alterar banner"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openBannerPicker(project.id);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          image
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Remover banner"
                        aria-label="Remover banner"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleRemoveBanner(project);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          hide_image
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Baixar / Imprimir"
                        aria-label="Baixar / Imprimir"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPrintProjectId(project.id);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          print
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Tags"
                        aria-label="Tags"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openTagEditor(project);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          sell
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Excluir"
                        aria-label="Excluir"
                        disabled={isWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRequestDelete(project);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-accent-rose hover:bg-accent-rose/10 dark:text-accent-rose dark:hover:bg-accent-rose/10 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          delete
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>

                {project.description ? (
                  <p
                    className={
                      viewMode === "grid"
                        ? "text-sm text-gray-500 dark:text-text-muted-dark mb-2 line-clamp-2"
                        : "text-sm text-gray-500 dark:text-text-muted-dark mb-2 line-clamp-1"
                    }
                  >
                    {project.description}
                  </p>
                ) : (
                  <p
                    className={
                      viewMode === "grid"
                        ? "text-sm text-gray-500 dark:text-text-muted-dark mb-2 line-clamp-2"
                        : "text-sm text-gray-500 dark:text-text-muted-dark mb-2 line-clamp-1"
                    }
                  >
                    {project.design_data?.meta?.notes ||
                      "Gerencie e edite seu molde digital."}
                  </p>
                )}

                {projectTags.length > 0 ? (
                  <div
                    className={
                      viewMode === "grid"
                        ? "mb-4 flex flex-wrap gap-1"
                        : "mb-3 flex flex-wrap gap-1"
                    }
                  >
                    {projectTags.map((tag) => {
                      const normalized =
                        normalizeHexColor(tag.color ?? "") ?? DEFAULT_TAG_COLOR;
                      const styles = tagBadgeStyles(normalized);
                      return (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                          style={styles.badgeStyle}
                        >
                          <span
                            className="mr-1.5 h-2 w-2 rounded-full"
                            style={styles.dotStyle}
                          />
                          {tag.name}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-auto pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">
                        calendar_today
                      </span>
                      <span>Criado: {formatDatePtBr(project.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">
                        edit
                      </span>
                      <span>
                        Modificado: {formatDatePtBr(project.updated_at)}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-primary dark:text-accent-rose group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark p-8 text-center">
          <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-accent-gold/15">
            <span className="material-symbols-outlined text-[32px] text-primary">
              folder_open
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-text-main-dark">
            Nenhum projeto encontrado
          </h3>
          <p className="text-sm text-gray-500 dark:text-text-muted-dark mt-2">
            {projects.length === 0
              ? "Comece criando seu primeiro projeto de modelagem."
              : "Tente ajustar sua busca."}
          </p>
        </div>
      ) : null}
    </>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={
        "w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-60 disabled:pointer-events-none " +
        (variant === "danger"
          ? "text-accent-rose dark:text-accent-rose"
          : "text-gray-800 dark:text-gray-100")
      }
    >
      <span
        className={
          "material-symbols-outlined text-[18px] " +
          (variant === "danger"
            ? "text-accent-rose"
            : "text-gray-500 dark:text-gray-300")
        }
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
