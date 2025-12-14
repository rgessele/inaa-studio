"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UnitSettings } from "./UnitSettings";
import { ViewMenu } from "./ViewMenu";
import { useEditor } from "./EditorContext";
import { SaveProjectModal } from "./SaveProjectModal";
import { Toast } from "./Toast";
import { saveProject, saveProjectAsCopy } from "@/lib/projects";
import { useRouter } from "next/navigation";
import { FileMenu } from "./FileMenu";
import { EditMenu } from "./EditMenu";

export function EditorHeader() {
  const {
    shapes,
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    hasUnsavedChanges,
    markProjectSaved,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditor();
  const router = useRouter();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
    isVisible: boolean;
  }>({
    message: "",
    type: "success",
    isVisible: false,
  });

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
  };

  const handleSaveClick = useCallback(async () => {
    if (isSaving) return;
    if (!projectId) {
      setShowSaveModal(true);
      return;
    }

    setIsSaving(true);
    const result = await saveProject(projectName, shapes, projectId);

    if (result.success) {
      markProjectSaved();
      setToast({
        message: "Projeto salvo com sucesso!",
        type: "success",
        isVisible: true,
      });
    } else {
      setToast({
        message: result.error || "Erro ao salvar projeto",
        type: "error",
        isVisible: true,
      });
    }

    setIsSaving(false);
  }, [isSaving, markProjectSaved, projectId, projectName, shapes]);

  const handleSaveAsShortcut = useCallback(() => {
    if (isSaving) return;
    if (!projectId) {
      setShowSaveModal(true);
      return;
    }
    setShowSaveAsModal(true);
  }, [isSaving, projectId]);

  useEffect(() => {
    const isTypingElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;

      const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      // Salvar como...: Cmd/Ctrl+Shift+S
      if (cmdOrCtrl && event.shiftKey && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        handleSaveAsShortcut();
        return;
      }

      // Salvar: Cmd/Ctrl+S
      if (cmdOrCtrl && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        void handleSaveClick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSaveAsShortcut, handleSaveClick]);

  const handleSave = async (name: string) => {
    setIsSaving(true);
    const result = await saveProject(name, shapes, projectId);

    if (result.success && result.projectId) {
      setProjectName(name);
      setProjectId(result.projectId);
      markProjectSaved();
      setToast({
        message: "Projeto salvo com sucesso!",
        type: "success",
        isVisible: true,
      });
      setShowSaveModal(false);
      router.replace(`/editor/${result.projectId}`);
    } else {
      setToast({
        message: result.error || "Erro ao salvar projeto",
        type: "error",
        isVisible: true,
      });
    }
    setIsSaving(false);
  };

  const handleSaveAs = async (name: string) => {
    if (!projectId) {
      await handleSave(name);
      return;
    }

    setIsSaving(true);
    const result = await saveProjectAsCopy(projectId, name, shapes);

    if (result.success && result.projectId) {
      setProjectName(name);
      setProjectId(result.projectId);
      markProjectSaved();
      setToast({
        message: "Cópia salva com sucesso!",
        type: "success",
        isVisible: true,
      });
      setShowSaveAsModal(false);
      router.replace(`/editor/${result.projectId}`);
    } else {
      setToast({
        message: result.error || "Erro ao salvar como...",
        type: "error",
        isVisible: true,
      });
    }

    setIsSaving(false);
  };

  const handleBackToDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <>
      <header className="h-12 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 shrink-0 z-20 shadow-subtle relative">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center shrink-0">
            {/* Logo */}
            <img
              src="/logo.png"
              alt="Inaá Studio"
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="hidden md:flex ml-6 text-xs text-text-muted dark:text-text-muted-dark gap-1">
            <FileMenu
              onSave={handleSaveClick}
              onSaveAs={() => setShowSaveAsModal(true)}
              disabled={isSaving}
            />
            <EditMenu
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
            />
            <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
              Objeto
            </button>
            <ViewMenu />
            <button className="hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary dark:hover:text-white px-3 py-1.5 rounded transition-colors">
              Janela
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[420px]">
            {projectName}
          </div>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-[10px] text-text-muted dark:text-text-muted-dark shrink-0">
              <span className="h-2 w-2 rounded-full bg-accent-gold" />
              Não salvo
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Save button */}
          <button
            onClick={handleSaveClick}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Salvar Projeto"
            disabled={isSaving}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
          <UnitSettings />
          <div className="flex items-center mr-2">
            <button
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
              onClick={toggleTheme}
              title="Alternar Tema"
            >
              <span className="material-symbols-outlined text-[18px]">
                brightness_4
              </span>
            </button>
          </div>
          <button
            onClick={handleBackToDashboard}
            className="bg-primary hover:bg-primary-hover text-white text-xs font-medium px-3 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">
              dashboard
            </span>
            Dashboard
          </button>
          <div className="h-5 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
          <button
            className="relative h-8 w-8 rounded-full bg-accent-gold text-white flex items-center justify-center text-xs font-semibold shadow-sm hover:ring-2 hover:ring-offset-2 hover:ring-accent-gold dark:ring-offset-surface-dark transition-all"
            title="Perfil do Usuário"
          >
            JD
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 border-2 border-surface-light dark:border-surface-dark rounded-full"></span>
          </button>
        </div>
      </header>

      {showSaveModal && (
        <SaveProjectModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          onSave={handleSave}
          currentName={projectName}
          isSaving={isSaving}
        />
      )}

      {showSaveAsModal && (
        <SaveProjectModal
          isOpen={showSaveAsModal}
          onClose={() => setShowSaveAsModal(false)}
          onSave={handleSaveAs}
          currentName={projectName}
          isSaving={isSaving}
          title="Salvar como..."
          nameLabel="Nome da Cópia"
          confirmLabel="Salvar cópia"
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </>
  );
}
