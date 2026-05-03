"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { InlineSpinner } from "@/components/InlineSpinner";
import {
  getPaperDimensionsCm,
  type PaperOrientation,
  type PaperSize,
} from "@/components/editor/exportSettings";
import { importPatternPdf } from "@/components/editor/pdfPatternImport";
import type {
  DesignDataV2,
  Figure,
  PageGuideSettings,
} from "@/components/editor/types";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/utils/toast";

interface ImportProjectsButtonProps {
  className?: string;
  children?: React.ReactNode;
}

type ImportResultItem = {
  fileName: string;
  projectName: string;
  status: "success" | "error";
  detail: string;
};

type ImportSessionState = {
  stage: "running" | "done";
  total: number;
  processed: number;
  importedCount: number;
  currentFileName: string | null;
  results: ImportResultItem[];
};

const DEFAULT_IMPORT_PAPER_SIZE: PaperSize = "A4";
const DEFAULT_IMPORT_ORIENTATION: PaperOrientation = "portrait";
const IMPORTED_TAG_NAME = "Importado PDF";
const DEFAULT_PAGE_GUIDE_SETTINGS: PageGuideSettings = {
  paperSize: DEFAULT_IMPORT_PAPER_SIZE,
  orientation: DEFAULT_IMPORT_ORIENTATION,
  marginCm: 1,
};
const DEFAULT_PRINT_DIMENSIONS = getPaperDimensionsCm(
  DEFAULT_IMPORT_PAPER_SIZE,
  DEFAULT_IMPORT_ORIENTATION
);

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function getProjectNameFromFile(file: File) {
  return file.name.replace(/\.pdf$/i, "").trim() || "Importado de PDF";
}

function buildImportedDesignData(figures: Figure[]): DesignDataV2 {
  return {
    version: 2,
    figures,
    guides: [],
    pageGuideSettings: { ...DEFAULT_PAGE_GUIDE_SETTINGS },
    meta: {
      print: {
        widthCm: DEFAULT_PRINT_DIMENSIONS.widthCm,
        heightCm: DEFAULT_PRINT_DIMENSIONS.heightCm,
        unit: "cm",
      },
    },
  };
}

async function ensureImportedTagId(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const existing = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", IMPORTED_TAG_NAME)
    .maybeSingle();

  if (existing.error) {
    return { tagId: null, error: existing.error.message };
  }

  const existingTag = existing.data as { id: string } | null;
  if (existingTag?.id) {
    return { tagId: existingTag.id, error: null };
  }

  const created = await supabase
    .from("tags")
    .insert([{ user_id: userId, name: IMPORTED_TAG_NAME }])
    .select("id")
    .single();

  if (!created.error && created.data) {
    return {
      tagId: (created.data as { id: string }).id,
      error: null,
    };
  }

  const code = (created.error as { code?: string } | null)?.code;
  if (
    code === "23505" ||
    created.error?.message?.includes("tags_user_name_unique") ||
    created.error?.message?.toLowerCase()?.includes("duplicate key")
  ) {
    const raceRead = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", IMPORTED_TAG_NAME)
      .maybeSingle();

    if (raceRead.error) {
      return { tagId: null, error: raceRead.error.message };
    }

    const raceTag = raceRead.data as { id: string } | null;
    return {
      tagId: raceTag?.id ?? null,
      error:
        raceTag?.id ? null : "Não foi possível localizar a tag de importação.",
    };
  }

  return {
    tagId: null,
    error: created.error?.message ?? "Não foi possível criar a tag de importação.",
  };
}

export function ImportProjectsButton({
  className,
  children,
}: ImportProjectsButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [session, setSession] = useState<ImportSessionState | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!session) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [session]);

  const buttonLabel = useMemo(() => {
    if (!session || session.total === 0) {
      return children ?? "Importar";
    }

    const current = Math.min(session.processed + 1, session.total);
    return `Importando ${current}/${session.total}`;
  }, [children, session]);

  const progressPercent = useMemo(() => {
    if (!session || session.total === 0) return 0;
    return Math.round((session.processed / session.total) * 100);
  }, [session]);

  const successCount =
    session?.results.filter((item) => item.status === "success").length ?? 0;
  const failureCount =
    session?.results.filter((item) => item.status === "error").length ?? 0;

  const handleOpenPicker = () => {
    if (isImporting || session?.stage === "done") return;
    fileInputRef.current?.click();
  };

  const handleCloseModal = () => {
    if (!session || session.stage !== "done") return;

    const shouldRefresh = session.importedCount > 0;
    setSession(null);

    if (shouldRefresh) {
      router.refresh();
    }
  };

  const appendResult = (
    processed: number,
    importedCount: number,
    item: ImportResultItem,
    currentFileName: string | null
  ) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            processed,
            importedCount,
            currentFileName,
            results: [...prev.results, item],
          }
        : prev
    );
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    const files = selectedFiles.filter(isPdfFile);
    if (files.length === 0) {
      toast("Selecione pelo menos um arquivo PDF.", "error");
      return;
    }

    setIsImporting(true);
    setSession({
      stage: "running",
      total: files.length,
      processed: 0,
      importedCount: 0,
      currentFileName: null,
      results: [],
    });

    let importedCount = 0;

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setSession({
          stage: "done",
          total: files.length,
          processed: 0,
          importedCount: 0,
          currentFileName: null,
          results: [
            {
              fileName: "Lote inteiro",
              projectName: "-",
              status: "error",
              detail: "Usuário não autenticado.",
            },
          ],
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setSession({
          stage: "done",
          total: files.length,
          processed: 0,
          importedCount: 0,
          currentFileName: null,
          results: [
            {
              fileName: "Lote inteiro",
              projectName: "-",
              status: "error",
              detail: profileError.message,
            },
          ],
        });
        return;
      }

      if (profile?.role !== "admin") {
        setSession({
          stage: "done",
          total: files.length,
          processed: 0,
          importedCount: 0,
          currentFileName: null,
          results: [
            {
              fileName: "Lote inteiro",
              projectName: "-",
              status: "error",
              detail: "A importação em lote está disponível apenas para admins.",
            },
          ],
        });
        return;
      }

      const importedTag = await ensureImportedTagId(supabase, user.id);
      if (!importedTag.tagId) {
        setSession({
          stage: "done",
          total: files.length,
          processed: 0,
          importedCount: 0,
          currentFileName: null,
          results: [
            {
              fileName: "Lote inteiro",
              projectName: "-",
              status: "error",
              detail:
                importedTag.error ??
                "Não foi possível preparar a tag obrigatória de importação.",
            },
          ],
        });
        return;
      }

      for (const [index, file] of files.entries()) {
        const projectName = getProjectNameFromFile(file);

        setSession((prev) =>
          prev
            ? {
                ...prev,
                currentFileName: file.name,
              }
            : prev
        );

        try {
          const result = await importPatternPdf(file);

          if (result.figures.length === 0) {
            appendResult(
              index + 1,
              importedCount,
              {
                fileName: file.name,
                projectName,
                status: "error",
                detail: "Nenhum contorno vetorial compatível foi encontrado.",
              },
              file.name
            );
            continue;
          }

          const createdProject = await supabase
            .from("projects")
            .insert([
              {
                name: projectName,
                description: null,
                user_id: user.id,
                design_data: buildImportedDesignData(result.figures),
              },
            ])
            .select("id")
            .single();

          const projectId = (createdProject.data as { id?: string } | null)?.id;
          if (createdProject.error || !projectId) {
            appendResult(
              index + 1,
              importedCount,
              {
                fileName: file.name,
                projectName,
                status: "error",
                detail: createdProject.error?.message ?? "Erro ao criar projeto.",
              },
              file.name
            );
            continue;
          }

          const linkedTag = await supabase.from("project_tags").insert([
            {
              project_id: projectId,
              tag_id: importedTag.tagId,
            },
          ]);

          if (linkedTag.error) {
            const cleanup = await supabase
              .from("projects")
              .delete()
              .eq("id", projectId)
              .eq("user_id", user.id);

            const cleanupSuffix = cleanup.error
              ? ` A limpeza do projeto falhou: ${cleanup.error.message}`
              : "";

            appendResult(
              index + 1,
              importedCount,
              {
                fileName: file.name,
                projectName,
                status: "error",
                detail:
                  `Não foi possível aplicar a tag \"${IMPORTED_TAG_NAME}\". ` +
                  `${linkedTag.error.message}${cleanupSuffix}`,
              },
              file.name
            );
            continue;
          }

          importedCount += 1;
          appendResult(
            index + 1,
            importedCount,
            {
              fileName: file.name,
              projectName,
              status: "success",
              detail: `Projeto criado com a tag \"${IMPORTED_TAG_NAME}\".`,
            },
            file.name
          );
        } catch (error) {
          console.error("Dashboard PDF import error:", error);
          appendResult(
            index + 1,
            importedCount,
            {
              fileName: file.name,
              projectName,
              status: "error",
              detail:
                error instanceof Error
                  ? error.message
                  : "Não foi possível importar este PDF.",
            },
            file.name
          );
        }
      }
    } finally {
      setIsImporting(false);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              stage: "done",
              importedCount,
              currentFileName: null,
            }
          : prev
      );
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event);
        }}
      />

      <button
        type="button"
        onClick={handleOpenPicker}
        disabled={isImporting}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 font-medium text-gray-900 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-surface-dark dark:text-gray-100 dark:hover:border-gray-500 dark:hover:bg-gray-800"
        }
      >
        {isImporting ? (
          <>
            <InlineSpinner className="h-4 w-4" />
            <span>{buttonLabel}</span>
          </>
        ) : (
          (children ?? "Importar")
        )}
      </button>

      {isClient && session
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-6">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => {
                  if (session.stage === "done") {
                    handleCloseModal();
                  }
                }}
              />

              <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-surface-dark dark:text-gray-100 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      {session.stage === "running"
                        ? "Importação em andamento"
                        : "Resumo da importação"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {session.stage === "running"
                        ? "Importando projetos a partir dos PDFs"
                        : "Importação concluída"}
                    </h2>
                  </div>

                  {session.stage === "done" ? (
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                      aria-label="Fechar resumo da importação"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span>
                        Arquivos selecionados: <strong>{session.total}</strong>
                      </span>
                      <span>
                        Projetos importados: <strong>{session.importedCount}</strong>
                      </span>
                      <span>
                        Falhas: <strong>{failureCount}</strong>
                      </span>
                      <span>
                        Tag aplicada: <strong>{IMPORTED_TAG_NAME}</strong>
                      </span>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span>
                        {session.stage === "running"
                          ? `${session.processed} de ${session.total} arquivo(s) finalizados`
                          : `${session.processed} de ${session.total} arquivo(s) processados`}
                      </span>
                      <span>
                        {session.currentFileName
                          ? `Arquivo atual: ${session.currentFileName}`
                          : session.stage === "done"
                            ? "Processamento encerrado"
                            : "Preparando importação..."}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                      <p className="text-sm text-emerald-700 dark:text-emerald-300">
                        Importados com sucesso
                      </p>
                      <p className="mt-2 text-3xl font-semibold text-emerald-800 dark:text-emerald-200">
                        {successCount}
                      </p>
                    </div>

                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/20">
                      <p className="text-sm text-red-700 dark:text-red-300">Falhas</p>
                      <p className="mt-2 text-3xl font-semibold text-red-800 dark:text-red-200">
                        {failureCount}
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Total de projetos criados
                      </p>
                      <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                        {session.importedCount}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Detalhes por arquivo
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {session.results.length} {session.results.length === 1 ? "resultado" : "resultados"}
                      </span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                      {session.results.length === 0 ? (
                        <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <InlineSpinner className="h-4 w-4" />
                          {session.stage === "running"
                            ? "Aguardando o primeiro resultado..."
                            : "Nenhum resultado disponível."}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {session.results.map((item, index) => (
                            <div
                              key={`${item.fileName}-${item.status}-${index}`}
                              className={`rounded-xl border px-4 py-3 ${
                                item.status === "success"
                                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                                  : "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {item.fileName}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-300">
                                    Projeto: {item.projectName}
                                  </p>
                                </div>

                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                    item.status === "success"
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
                                      : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200"
                                  }`}
                                >
                                  {item.status === "success" ? "Importado" : "Falhou"}
                                </span>
                              </div>

                              <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                                {item.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  {session.stage === "running" ? (
                    <div className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <InlineSpinner className="h-4 w-4" />
                      Processando os PDFs selecionados...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                    >
                      Fechar e atualizar dashboard
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}