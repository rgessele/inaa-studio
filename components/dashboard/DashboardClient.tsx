"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import type { Project } from "@/lib/projects";

type SortOption = "recent" | "old" | "name";

function formatDatePtBr(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function getCoverUrl(project: Project): string | null {
  return project.design_data?.meta?.coverUrl ?? null;
}

export function DashboardClient({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const base = normalizedQuery
      ? projects.filter((project) => {
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
      : projects;

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
  }, [projects, query, sort]);

  return (
    <>
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
          {filtered.map((project) => {
            const coverUrl = getCoverUrl(project);

            return (
              <Link
                key={project.id}
                href={`/editor/${project.id}`}
                className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-floating transition-all duration-300 flex flex-col"
              >
                <div className="relative h-48 w-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={project.name}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                      src={coverUrl}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent-gold/20 dark:from-primary/25 dark:to-accent-gold/15" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />

                  <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md rounded-full p-1.5 text-white transition-colors pointer-events-none">
                    <span className="material-symbols-outlined text-[18px]">
                      more_vert
                    </span>
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
