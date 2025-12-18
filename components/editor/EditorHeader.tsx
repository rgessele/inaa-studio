"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { UnitSettings } from "./UnitSettings";
import { ViewMenu } from "./ViewMenu";
import { useEditor } from "./EditorContext";
import { SaveProjectModal } from "./SaveProjectModal";
import { Toast } from "./Toast";
import { saveProject, saveProjectAsCopy } from "@/lib/projects";
import { useRouter } from "next/navigation";
import { FileMenu } from "./FileMenu";
import { EditMenu } from "./EditMenu";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";

export function EditorHeader() {
  const {
    figures,
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
  const [userInfo, setUserInfo] = useState<{
    displayName: string;
    email: string;
    initials: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
    isVisible: boolean;
  }>({
    message: "",
    type: "success",
    isVisible: false,
  });

  const saveTooltip = useDelayedTooltip(true);
  const themeTooltip = useDelayedTooltip(true);
  const profileTooltip = useDelayedTooltip(true);
  const signOutTooltip = useDelayedTooltip(true);


  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;

      const displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        (user.email ? user.email.split("@")[0] : "Usuário");
      const email = user.email ?? "";
      const initials = displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
        .slice(0, 2);

      setUserInfo({
        displayName,
        email,
        initials: initials || "U",
      });
    };

    void loadUser();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }, [router]);

  const handleSaveClick = useCallback(async () => {
    if (isSaving) return;
    if (!projectId) {
      setShowSaveModal(true);
      return;
    }

    setIsSaving(true);
    const result = await saveProject(projectName, figures, projectId);

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
  }, [isSaving, markProjectSaved, projectId, projectName, figures]);

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
      if (
        cmdOrCtrl &&
        event.shiftKey &&
        (event.key === "s" || event.key === "S")
      ) {
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
    const result = await saveProject(name, figures, projectId);

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
    const result = await saveProjectAsCopy(projectId, name, figures);

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
            <Image
              src="/logo.png"
              alt="Inaá Studio"
              width={140}
              height={36}
              className="h-9 w-auto object-contain"
              priority
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
            onMouseEnter={saveTooltip.onMouseEnter}
            onMouseLeave={saveTooltip.onMouseLeave}
            className="group relative bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {isSaving ? "Salvando..." : "Salvar"}
            <HeaderTooltip
              title="Salvar Projeto"
              expanded={saveTooltip.expanded}
              details={["Salva as alterações do projeto atual."]}
            />
          </button>
          <UnitSettings />
          <div className="flex items-center mr-2">
            <ThemeToggleButton
              onMouseEnter={themeTooltip.onMouseEnter}
              onMouseLeave={themeTooltip.onMouseLeave}
              className="group relative"
              iconClassName="text-[18px]"
            >
              <HeaderTooltip
                title="Alternar Tema"
                expanded={themeTooltip.expanded}
                details={["Alterna entre modo claro e escuro."]}
              />
            </ThemeToggleButton>
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
          <div className="flex items-center gap-3 pl-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-gray-900 dark:text-accent-gold">
                {userInfo?.displayName ?? "Usuário"}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {userInfo?.email ?? ""}
              </p>
            </div>

            <div
              onMouseEnter={profileTooltip.onMouseEnter}
              onMouseLeave={profileTooltip.onMouseLeave}
              className="relative group cursor-pointer"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold shadow-subtle border-2 border-white dark:border-gray-700 text-xs">
                {userInfo?.initials ?? "U"}
              </div>
              <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-surface-dark" />
              <HeaderTooltip
                title="Perfil do Usuário"
                expanded={profileTooltip.expanded}
                details={["Informações da conta e sessão."]}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-red-500 hover:text-red-700 dark:text-accent-rose dark:hover:text-red-300 transition-colors"
              onMouseEnter={signOutTooltip.onMouseEnter}
              onMouseLeave={signOutTooltip.onMouseLeave}
            >
              <span className="material-symbols-outlined text-[22px]">
                logout
              </span>
              <HeaderTooltip
                title="Sair"
                expanded={signOutTooltip.expanded}
                details={["Encerra sua sessão e volta para o login."]}
              />
            </button>
          </div>
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

function HeaderTooltip({
  title,
  details,
  expanded,
}: {
  title: string;
  details?: string[];
  expanded?: boolean;
}) {
  const hasDetails = Boolean(details && details.length > 0);

  return (
    <span className="absolute left-1/2 top-full -translate-x-1/2 mt-2 z-50">
      <span
        className={
          "bg-gray-900 text-white rounded px-2 py-1 pointer-events-none whitespace-nowrap " +
          "opacity-0 group-hover:opacity-100 transition-opacity " +
          (expanded ? "text-[11px]" : "text-[10px]")
        }
      >
        <span className="inline-flex items-center gap-2">
          <span>{title}</span>
        </span>
        {expanded && hasDetails ? (
          <span className="mt-1 block max-w-[220px] whitespace-normal text-[10px] text-white/90">
            {details!.slice(0, 4).map((line, index) => (
              <span key={index} className="block leading-snug">
                {line}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function useDelayedTooltip(hasDetails: boolean) {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<number | null>(null);

  const onMouseEnter = useCallback(() => {
    if (!hasDetails) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setExpanded(true), 3000);
  }, [hasDetails]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setExpanded(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { expanded, onMouseEnter, onMouseLeave };
}
