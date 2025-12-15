"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GradeOption = "none";

interface NewProjectButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function NewProjectButton({ className, children }: NewProjectButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [fabric, setFabric] = useState("");
  const [notes, setNotes] = useState("");
  const [printWidthCm, setPrintWidthCm] = useState<number>(100);
  const [printHeightCm, setPrintHeightCm] = useState<number>(100);
  const [grade, setGrade] = useState<GradeOption>("none");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const coverPreviewUrl = useMemo(() => {
    if (!coverFile) return null;
    return URL.createObjectURL(coverFile);
  }, [coverFile]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  const canSubmit =
    name.trim().length > 0 &&
    Number.isFinite(printWidthCm) &&
    Number.isFinite(printHeightCm) &&
    printWidthCm > 0 &&
    printHeightCm > 0;

  const onPickImage = () => {
    inputRef.current?.click();
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    setCoverFile(file);
  };

  const onCreate = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError("Usuário não autenticado.");
        return;
      }

      const baseDesignData = {
        shapes: [],
        meta: {
          fabric: fabric.trim() || null,
          notes: notes.trim() || null,
          print: {
            widthCm: printWidthCm,
            heightCm: printHeightCm,
            unit: "cm" as const,
          },
          grade,
          coverUrl: null as string | null,
        },
      };

      const { data: created, error: insertError } = await supabase
        .from("projects")
        .insert([
          {
            name: name.trim(),
            description: notes.trim() || null,
            user_id: user.id,
            design_data: baseDesignData,
          },
        ])
        .select("id")
        .single();

      if (insertError || !created?.id) {
        setError(insertError?.message ?? "Erro ao criar projeto.");
        return;
      }

      const projectId: string = created.id;

      let coverUrl: string | null = null;
      if (coverFile) {
        const ext =
          coverFile.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${user.id}/${projectId}/cover.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("project-covers")
          .upload(path, coverFile, {
            upsert: true,
            contentType: coverFile.type,
          });

        if (uploadError) {
          // Bucket missing or policies misconfigured: allow project creation anyway.
          setError(
            `Projeto criado, mas falhou ao enviar a imagem de capa: ${uploadError.message}`
          );
        } else {
          coverUrl = supabase.storage
            .from("project-covers")
            .getPublicUrl(path).data.publicUrl;
        }
      }

      if (coverUrl) {
        await supabase
          .from("projects")
          .update({
            design_data: {
              ...baseDesignData,
              meta: {
                ...baseDesignData.meta,
                coverUrl,
              },
            },
          })
          .eq("id", projectId)
          .eq("user_id", user.id);
      }

      setOpen(false);
      router.push(`/editor/${projectId}`);
    } catch {
      setError("Erro inesperado ao criar projeto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        }
      >
        {children ?? (
          <>
            <span className="mr-2 text-xl">+</span>
            Novo Projeto
          </>
        )}
      </button>

      {isClient && open
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => (!isSubmitting ? setOpen(false) : null)}
              />

              <div className="relative w-[92vw] max-w-5xl rounded-2xl bg-white shadow-xl">
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => (!isSubmitting ? setOpen(false) : null)}
                  className="absolute right-4 top-4 text-gray-500 hover:text-gray-800"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-10">
                  <h2 className="text-4xl font-semibold text-gray-900">
                    Novo Projeto
                  </h2>

                  <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px]">
                    <div className="space-y-8">
                      <div>
                        <label className="text-sm text-gray-600">
                          Nome/Referência <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Camisa Feminina"
                          className="mt-2 w-full border-b border-gray-300 pb-2 text-2xl text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-600">Tecido</label>
                        <input
                          value={fabric}
                          onChange={(e) => setFabric(e.target.value)}
                          placeholder="Meia Malha 100% Algodão"
                          className="mt-2 w-full border-b border-gray-300 pb-2 text-xl text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-600">Observação</label>
                        <input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Observações"
                          className="mt-2 w-full border-b border-gray-300 pb-2 text-xl text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                        <div>
                          <label className="text-sm text-gray-600">
                            Largura da Impressão{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <div className="mt-2 flex items-end gap-3">
                            <input
                              type="number"
                              value={printWidthCm}
                              onChange={(e) =>
                                setPrintWidthCm(Number(e.target.value))
                              }
                              min={1}
                              className="w-full border-b border-gray-300 pb-2 text-2xl text-gray-900 focus:border-blue-600 focus:outline-none"
                            />
                            <span className="pb-2 text-lg text-gray-600">cm</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-sm text-gray-600">
                            Altura da Impressão{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <div className="mt-2 flex items-end gap-3">
                            <input
                              type="number"
                              value={printHeightCm}
                              onChange={(e) =>
                                setPrintHeightCm(Number(e.target.value))
                              }
                              min={1}
                              className="w-full border-b border-gray-300 pb-2 text-2xl text-gray-900 focus:border-blue-600 focus:outline-none"
                            />
                            <span className="pb-2 text-lg text-gray-600">cm</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-gray-600">Grades</label>
                        <div className="relative mt-2">
                          <select
                            value={grade}
                            onChange={(e) =>
                              setGrade(e.target.value as GradeOption)
                            }
                            className="w-full appearance-none border-b border-gray-300 pb-3 text-xl text-gray-900 focus:border-blue-600 focus:outline-none"
                          >
                            <option value="none">Sem grade</option>
                          </select>
                          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 material-symbols-outlined">
                            expand_more
                          </span>
                        </div>
                      </div>

                      {error && (
                        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
                          {error}
                        </div>
                      )}
                    </div>

                    <div>
                      <div
                        onClick={onPickImage}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                        className="flex h-[360px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 px-6 text-center"
                      >
                        {coverPreviewUrl ? (
                          <div className="h-full w-full overflow-hidden rounded-xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coverPreviewUrl}
                              alt="Capa do projeto"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                              <span className="material-symbols-outlined text-3xl">
                                image
                              </span>
                            </div>
                            <div className="text-lg font-semibold text-gray-900">
                              Selecionar Imagem
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Clique aqui ou arraste e solte a imagem de capa do projeto
                            </div>
                          </>
                        )}

                        <input
                          ref={inputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) return;
                            if (!file.type.startsWith("image/")) {
                              setError("Selecione um arquivo de imagem.");
                              return;
                            }
                            setCoverFile(file);
                          }}
                        />
                      </div>

                      <div className="mt-8 flex justify-end">
                        <button
                          type="button"
                          onClick={onCreate}
                          disabled={!canSubmit || isSubmitting}
                          className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-medium transition-colors ${
                            !canSubmit || isSubmitting
                              ? "bg-gray-200 text-gray-500"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          <span className="material-symbols-outlined">
                            add_circle
                          </span>
                          {isSubmitting ? "Criando..." : "Criar Projeto"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
