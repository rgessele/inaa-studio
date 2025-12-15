"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/projects";
import { saveProjectAsCopy } from "@/lib/projects";

type SortOption = "recent" | "old" | "name";

function formatDatePtBr(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function getCoverUrl(project: Project): string | null {
  return project.design_data?.meta?.coverUrl ?? null;
}

export function DashboardClient({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");
  const [items, setItems] = useState<Project[]>(projects);
  const [isClient, setIsClient] = useState(false);
  const [openMenuForProjectId, setOpenMenuForProjectId] = useState<string | null>(
    null
  );
  const [printProjectId, setPrintProjectId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingBannerProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

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
    setItems(projects);
  }, [projects]);

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

      setOpenMenuForProjectId(null);
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
      const result = await saveProjectAsCopy(
        project.id,
        newName.trim(),
        project.design_data?.shapes ?? []
      );

      if (!result.success || !result.projectId) {
        alert(result.error ?? "Erro ao duplicar projeto.");
        return;
      }

      const supabase = createClient();
      const { data: created, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", result.projectId)
        .single();

      if (error || !created) {
        router.refresh();
        return;
      }

      setItems((prev) => [created as Project, ...prev]);
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
        prev.map((p) => (p.id === project.id ? { ...p, name: newName.trim() } : p))
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

    const sorted = [...base];

    if (sort === "recent") {
      sorted.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }

    if (sort === "old") {
      sorted.sort(
        (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      );
    }

    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    return sorted;
  }, [items, query, sort]);

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

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-grow max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-[20px] text-gray-400">
              search
            </span>
          </span>
          <input
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md leading-5 bg-surface-light dark:bg-surface-dark placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm text-gray-900 dark:text-text-main-dark shadow-subtle"
            placeholder="Buscar projetos..."
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <select
            className="block w-full pl-3 pr-10 py-2 text-base border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-surface-light dark:bg-surface-dark text-gray-900 dark:text-text-main-dark shadow-subtle"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
          >
            <option value="recent">Mais recentes</option>
            <option value="old">Antigos</option>
            <option value="name">Nome (A-Z)</option>
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBannerFileSelected}
          />
          {filtered.map((project) => {
            const coverUrl = getCoverUrl(project) || "/no-banner.png";

            return (
              <Link
                key={project.id}
                href={`/editor/${project.id}`}
                className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-floating transition-all duration-300 flex flex-col"
              >
                <div className="relative h-48 w-full bg-gray-200 dark:bg-gray-700">
                  <div className="absolute inset-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={project.name}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                      src={coverUrl}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                  </div>

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
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="p-5 flex-grow flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-text-main-dark group-hover:text-primary transition-colors line-clamp-1">
                      {project.name}
                    </h3>
                  </div>

                  {project.description ? (
                    <p className="text-sm text-gray-500 dark:text-text-muted-dark mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-text-muted-dark mb-4 line-clamp-2">
                      {project.design_data?.meta?.notes ||
                        "Gerencie e edite seu molde digital."}
                    </p>
                  )}

                  <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
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
                        <span>Modificado: {formatDatePtBr(project.updated_at)}</span>
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

          <NewProjectButton className="group flex flex-col items-center justify-center h-full min-h-[350px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary hover:bg-white dark:hover:bg-white/5 transition-all duration-300">
            <div className="h-16 w-16 rounded-full bg-accent-gold/15 dark:bg-accent-gold/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-primary dark:text-accent-gold text-[32px]">
                add
              </span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-text-main-dark">
              Criar novo design
            </h3>
            <p className="text-sm text-gray-500 dark:text-text-muted-dark mt-2">
              Comece um projeto do zero
            </p>
          </NewProjectButton>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark p-8 text-center">
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
          <div className="mt-6">
            <NewProjectButton className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover shadow-lg shadow-black/20 dark:shadow-black/40" />
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
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
      className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 text-gray-800 dark:text-gray-100 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-60 disabled:pointer-events-none"
    >
      <span className="material-symbols-outlined text-[18px] text-gray-500 dark:text-gray-300">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
