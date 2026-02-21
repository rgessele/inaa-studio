"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { NotificationBell } from "@/components/notifications/NotificationBell";

function isE2EAutomationActive(): boolean {
  return (
    process.env.NEXT_PUBLIC_E2E_TESTS === "1" &&
    typeof navigator !== "undefined" &&
    navigator.webdriver === true
  );
}

export function EditorHeader() {
  const {
    readOnly,
    figures,
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    projectMeta,
    pageGuideSettings,
    guides,
    hasUnsavedChanges,
    markProjectSaved,
    undo,
    redo,
    canUndo,
    canRedo,
    canCopy,
    copySelection,
    canPaste,
    paste,
  } = useEditor();
  const router = useRouter();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<{
    userId: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl: string | null;
  } | null>(null);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const AUTO_SAVE_IDLE_MS = 2500;
  const AUTO_SAVE_MAX_INTERVAL_MS = 10000;
  const AUTO_SAVE_MIN_INTERVAL_MS = 5000;
  const AUTO_SAVE_MAX_RETRY_MS = 120000;
  const AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS = 30000;

  const latestStateRef = useRef({
    projectId,
    projectName,
    projectMeta,
    figures,
    pageGuideSettings,
    guides,
    hasUnsavedChanges,
  });

  useEffect(() => {
    latestStateRef.current = {
      projectId,
      projectName,
      projectMeta,
      figures,
      pageGuideSettings,
      guides,
      hasUnsavedChanges,
    };
  }, [
    projectId,
    projectName,
    projectMeta,
    figures,
    pageGuideSettings,
    guides,
    hasUnsavedChanges,
  ]);

  const isSavingRef = useRef(isSaving);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const autoSaveInFlightRef = useRef(false);
  const autoSaveLastAttemptAtRef = useRef(0);
  const autoSaveDirtySinceRef = useRef<number | null>(null);
  const autoSavePrevUnsavedRef = useRef(false);
  const autoSaveRetryDelayMsRef = useRef(AUTO_SAVE_MAX_INTERVAL_MS);
  const autoSaveLastErrorToastAtRef = useRef(0);

  const autoSaveIdleTimerRef = useRef<number | null>(null);
  const autoSaveMaxTimerRef = useRef<number | null>(null);
  const autoSaveRetryTimerRef = useRef<number | null>(null);

  const clearAutoSaveTimers = useCallback(() => {
    if (autoSaveIdleTimerRef.current != null) {
      window.clearTimeout(autoSaveIdleTimerRef.current);
      autoSaveIdleTimerRef.current = null;
    }
    if (autoSaveMaxTimerRef.current != null) {
      window.clearTimeout(autoSaveMaxTimerRef.current);
      autoSaveMaxTimerRef.current = null;
    }
    if (autoSaveRetryTimerRef.current != null) {
      window.clearTimeout(autoSaveRetryTimerRef.current);
      autoSaveRetryTimerRef.current = null;
    }
  }, []);

  const runAutoSave = useCallback(
    async (reason: "idle" | "time" | "visibility" | "retry") => {
      if (isE2EAutomationActive()) return;

      const snapshotNow = latestStateRef.current;
      if (!snapshotNow.projectId) return;
      if (!snapshotNow.hasUnsavedChanges) return;
      if (autoSaveInFlightRef.current) return;
      if (isSavingRef.current) return;

      const now = Date.now();
      const sinceLastAttempt = now - autoSaveLastAttemptAtRef.current;
      if (sinceLastAttempt < AUTO_SAVE_MIN_INTERVAL_MS) {
        const delay = AUTO_SAVE_MIN_INTERVAL_MS - sinceLastAttempt;
        if (autoSaveRetryTimerRef.current != null) {
          window.clearTimeout(autoSaveRetryTimerRef.current);
        }
        autoSaveRetryTimerRef.current = window.setTimeout(() => {
          void runAutoSave("retry");
        }, delay);
        return;
      }

      autoSaveInFlightRef.current = true;
      autoSaveLastAttemptAtRef.current = now;

      const savedSnapshot = {
        figures: snapshotNow.figures,
        pageGuideSettings: snapshotNow.pageGuideSettings,
        guides: snapshotNow.guides,
      };

      try {
        const result = await saveProject(
          snapshotNow.projectName,
          savedSnapshot.figures,
          savedSnapshot.pageGuideSettings,
          savedSnapshot.guides,
          snapshotNow.projectId,
          snapshotNow.projectMeta
        );

        if (result.success) {
          markProjectSaved(savedSnapshot);
          autoSaveRetryDelayMsRef.current = AUTO_SAVE_MAX_INTERVAL_MS;
        } else {
          const delay = autoSaveRetryDelayMsRef.current;
          autoSaveRetryDelayMsRef.current = Math.min(
            autoSaveRetryDelayMsRef.current * 2,
            AUTO_SAVE_MAX_RETRY_MS
          );

          const toastNow = Date.now();
          if (
            toastNow - autoSaveLastErrorToastAtRef.current >=
            AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS
          ) {
            autoSaveLastErrorToastAtRef.current = toastNow;
            setToast({
              message:
                result.error || "Falha no auto-save. Tentando novamente...",
              type: "error",
              isVisible: true,
            });
          }

          if (autoSaveRetryTimerRef.current != null) {
            window.clearTimeout(autoSaveRetryTimerRef.current);
          }
          autoSaveRetryTimerRef.current = window.setTimeout(() => {
            void runAutoSave("retry");
          }, delay);
        }
      } catch (error) {
        console.error("Auto-save error:", error);
        const delay = autoSaveRetryDelayMsRef.current;
        autoSaveRetryDelayMsRef.current = Math.min(
          autoSaveRetryDelayMsRef.current * 2,
          AUTO_SAVE_MAX_RETRY_MS
        );

        const toastNow = Date.now();
        if (
          toastNow - autoSaveLastErrorToastAtRef.current >=
          AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS
        ) {
          autoSaveLastErrorToastAtRef.current = toastNow;
          setToast({
            message: "Falha no auto-save. Tentando novamente...",
            type: "error",
            isVisible: true,
          });
        }

        if (autoSaveRetryTimerRef.current != null) {
          window.clearTimeout(autoSaveRetryTimerRef.current);
        }
        autoSaveRetryTimerRef.current = window.setTimeout(() => {
          void runAutoSave("retry");
        }, delay);
      } finally {
        autoSaveInFlightRef.current = false;

        // If changes kept happening, make sure timers are still armed.
        // (We don't reschedule here directly to avoid extra work; the next render
        // from state updates will arm them.)
        if (reason === "visibility") {
          // Best effort: don't keep visibility-triggered idle timers around.
          if (autoSaveIdleTimerRef.current != null) {
            window.clearTimeout(autoSaveIdleTimerRef.current);
            autoSaveIdleTimerRef.current = null;
          }
        }
      }
    },
    [
      AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS,
      AUTO_SAVE_MAX_INTERVAL_MS,
      AUTO_SAVE_MAX_RETRY_MS,
      AUTO_SAVE_MIN_INTERVAL_MS,
      markProjectSaved,
    ]
  );

  useEffect(() => {
    if (isE2EAutomationActive()) return;

    if (readOnly) {
      autoSavePrevUnsavedRef.current = false;
      autoSaveDirtySinceRef.current = null;
      autoSaveRetryDelayMsRef.current = AUTO_SAVE_MAX_INTERVAL_MS;
      clearAutoSaveTimers();
      return;
    }

    if (!projectId) {
      autoSavePrevUnsavedRef.current = false;
      autoSaveDirtySinceRef.current = null;
      autoSaveRetryDelayMsRef.current = AUTO_SAVE_MAX_INTERVAL_MS;
      clearAutoSaveTimers();
      return;
    }

    if (!hasUnsavedChanges) {
      autoSavePrevUnsavedRef.current = false;
      autoSaveDirtySinceRef.current = null;
      autoSaveRetryDelayMsRef.current = AUTO_SAVE_MAX_INTERVAL_MS;
      clearAutoSaveTimers();
      return;
    }

    if (!autoSavePrevUnsavedRef.current) {
      autoSaveDirtySinceRef.current = Date.now();
      autoSavePrevUnsavedRef.current = true;
    }

    // Idle-save
    if (autoSaveIdleTimerRef.current != null) {
      window.clearTimeout(autoSaveIdleTimerRef.current);
    }
    autoSaveIdleTimerRef.current = window.setTimeout(() => {
      void runAutoSave("idle");
    }, AUTO_SAVE_IDLE_MS);

    // Time-save: guarantee save within max interval since first dirty
    const dirtySince = autoSaveDirtySinceRef.current ?? Date.now();
    const dueAt = dirtySince + AUTO_SAVE_MAX_INTERVAL_MS;
    const delay = Math.max(dueAt - Date.now(), 0);
    if (autoSaveMaxTimerRef.current != null) {
      window.clearTimeout(autoSaveMaxTimerRef.current);
    }
    autoSaveMaxTimerRef.current = window.setTimeout(() => {
      void runAutoSave("time");
    }, delay);

    return () => {
      if (autoSaveIdleTimerRef.current != null) {
        window.clearTimeout(autoSaveIdleTimerRef.current);
        autoSaveIdleTimerRef.current = null;
      }
      if (autoSaveMaxTimerRef.current != null) {
        window.clearTimeout(autoSaveMaxTimerRef.current);
        autoSaveMaxTimerRef.current = null;
      }
    };
  }, [
    AUTO_SAVE_IDLE_MS,
    AUTO_SAVE_MAX_INTERVAL_MS,
    clearAutoSaveTimers,
    figures,
    guides,
    hasUnsavedChanges,
    pageGuideSettings,
    projectId,
    projectName,
    readOnly,
    runAutoSave,
  ]);

  useEffect(() => {
    if (isE2EAutomationActive()) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void runAutoSave("visibility");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [runAutoSave]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimers();
    };
  }, [clearAutoSaveTimers]);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const displayNameFromProfile = profile?.full_name?.trim() || "";
      const displayName =
        displayNameFromProfile ||
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        (user.email ? user.email.split("@")[0] : "") ||
        "Usuário";
      const email = user.email ?? "";
      const initials = displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p: string) => p[0]?.toUpperCase())
        .join("")
        .slice(0, 2);

      setUserInfo({
        userId: user.id,
        displayName,
        email,
        initials: initials || "U",
        avatarUrl: profile?.avatar_url ?? null,
      });
    };

    void loadUser();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAvatarMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const root = avatarMenuRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setIsAvatarMenuOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [isAvatarMenuOpen]);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type, isVisible: true });
    },
    []
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!userInfo?.userId) return;
      if (!file.type.startsWith("image/")) {
        showToast("Escolha uma imagem (PNG/JPG/WebP).", "error");
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        showToast("A imagem deve ter no máximo 3MB.", "error");
        return;
      }

      setIsAvatarBusy(true);
      try {
        const supabase = createClient();
        const path = `${userInfo.userId}/avatar`;

        const uploadRes = await supabase.storage
          .from("avatars")
          .upload(path, file, {
            upsert: true,
            contentType: file.type,
          });

        if (uploadRes.error) {
          showToast("Não foi possível enviar sua foto.", "error");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);

        const avatarUrl = publicUrlData.publicUrl
          ? `${publicUrlData.publicUrl}?v=${Date.now()}`
          : null;

        const updateRes = await supabase
          .from("profiles")
          .update({ avatar_url: avatarUrl })
          .eq("id", userInfo.userId);

        if (updateRes.error) {
          showToast("Não foi possível salvar sua foto no perfil.", "error");
          return;
        }

        try {
          await supabase.auth.updateUser({
            data: avatarUrl ? { avatar_url: avatarUrl } : {},
          });
        } catch {
          // best-effort only
        }

        setUserInfo((prev) => (prev ? { ...prev, avatarUrl } : prev));
        showToast("Foto de perfil atualizada!", "success");
      } finally {
        setIsAvatarBusy(false);
      }
    },
    [showToast, userInfo]
  );

  const removeAvatar = useCallback(async () => {
    if (!userInfo?.userId) return;

    setIsAvatarBusy(true);
    try {
      const supabase = createClient();
      const path = `${userInfo.userId}/avatar`;

      await supabase.storage.from("avatars").remove([path]);

      const updateRes = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userInfo.userId);

      if (updateRes.error) {
        showToast("Não foi possível remover a foto do perfil.", "error");
        return;
      }

      try {
        await supabase.auth.updateUser({ data: { avatar_url: null } });
      } catch {
        // best-effort only
      }

      setUserInfo((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      showToast("Foto de perfil removida.", "success");
    } finally {
      setIsAvatarBusy(false);
    }
  }, [showToast, userInfo]);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }, [router]);

  const handleSaveClick = useCallback(async () => {
    if (readOnly) {
      setToast({
        message: "Modo somente leitura (admin)",
        type: "error",
        isVisible: true,
      });
      return;
    }
    if (isSaving) return;
    if (!projectId) {
      setShowSaveModal(true);
      return;
    }

    setIsSaving(true);
    const result = await saveProject(
      projectName,
      figures,
      pageGuideSettings,
      guides,
      projectId,
      projectMeta
    );

    if (result.success) {
      markProjectSaved({
        figures,
        pageGuideSettings,
        guides,
      });
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
  }, [
    readOnly,
    isSaving,
    markProjectSaved,
    projectId,
    projectName,
    projectMeta,
    figures,
    pageGuideSettings,
    guides,
  ]);

  const handleSaveAsShortcut = useCallback(() => {
    if (readOnly) {
      setToast({
        message: "Modo somente leitura (admin)",
        type: "error",
        isVisible: true,
      });
      return;
    }
    if (isSaving) return;
    if (!projectId) {
      setShowSaveModal(true);
      return;
    }
    setShowSaveAsModal(true);
  }, [readOnly, isSaving, projectId]);

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
      if (readOnly) return;

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
  }, [handleSaveAsShortcut, handleSaveClick, readOnly]);

  useEffect(() => {
    const onSave = () => {
      void handleSaveClick();
    };
    const onSaveAs = () => {
      handleSaveAsShortcut();
    };

    window.addEventListener("inaa:save", onSave);
    window.addEventListener("inaa:saveAs", onSaveAs);
    return () => {
      window.removeEventListener("inaa:save", onSave);
      window.removeEventListener("inaa:saveAs", onSaveAs);
    };
  }, [handleSaveAsShortcut, handleSaveClick]);

  const handleSave = async (name: string) => {
    if (readOnly) {
      setToast({
        message: "Modo somente leitura (admin)",
        type: "error",
        isVisible: true,
      });
      return;
    }
    setIsSaving(true);
    const result = await saveProject(
      name,
      figures,
      pageGuideSettings,
      guides,
      projectId,
      projectMeta
    );

    if (result.success && result.projectId) {
      setProjectName(name);
      setProjectId(result.projectId);
      markProjectSaved({
        figures,
        pageGuideSettings,
        guides,
      });
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
    const result = await saveProjectAsCopy(
      projectId,
      name,
      figures,
      pageGuideSettings,
      guides
    );

    if (result.success && result.projectId) {
      setProjectName(name);
      setProjectId(result.projectId);
      markProjectSaved({
        figures,
        pageGuideSettings,
        guides,
      });
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
              canCopy={canCopy}
              onCopy={copySelection}
              canPaste={canPaste}
              onPaste={paste}
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
          {readOnly ? (
            <div className="text-[11px] px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/30">
              Admin • Somente leitura
            </div>
          ) : (
            <button
              onClick={handleSaveClick}
              onMouseEnter={saveTooltip.onMouseEnter}
              onMouseLeave={saveTooltip.onMouseLeave}
              className="group relative bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              <span className="material-symbols-outlined text-[16px]">
                save
              </span>
              {isSaving ? "Salvando..." : "Salvar"}
              <HeaderTooltip
                title="Salvar Projeto"
                expanded={saveTooltip.expanded}
                details={["Salva as alterações do projeto atual."]}
              />
            </button>
          )}
          <button
            onClick={handleBackToDashboard}
            className="bg-primary hover:bg-primary-hover text-white text-xs font-medium px-3 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">
              dashboard
            </span>
            Dashboard
          </button>
          <div className="flex items-center">
            <NotificationBell />
          </div>
          <div className="flex items-center">
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

            <div ref={avatarMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsAvatarMenuOpen((prev) => !prev)}
                onMouseEnter={profileTooltip.onMouseEnter}
                onMouseLeave={profileTooltip.onMouseLeave}
                className="relative group cursor-pointer"
                aria-haspopup="menu"
                aria-expanded={isAvatarMenuOpen}
                aria-label="Abrir menu do perfil"
              >
                {userInfo?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userInfo.avatarUrl}
                    alt="Foto de perfil"
                    className="h-9 w-9 rounded-full object-cover shadow-subtle border-2 border-white dark:border-gray-700"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold shadow-subtle border-2 border-white dark:border-gray-700 text-xs">
                    {userInfo?.initials ?? "U"}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-surface-dark" />
                <HeaderTooltip
                  title="Perfil do Usuário"
                  expanded={profileTooltip.expanded}
                  details={["Clique para gerenciar sua foto."]}
                />
              </button>

              {isAvatarMenuOpen ? (
                <div
                  className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shadow-lg overflow-hidden z-50"
                  role="menu"
                >
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                    {userInfo?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={userInfo.avatarUrl}
                        alt="Foto de perfil"
                        className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold border border-gray-200 dark:border-gray-700">
                        {userInfo?.initials ?? "U"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {userInfo?.displayName ?? "Usuário"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {userInfo?.email ?? ""}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 space-y-2">
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0] ?? null;
                        e.currentTarget.value = "";
                        if (f) void uploadAvatar(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={isAvatarBusy}
                      className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-white text-xs font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      role="menuitem"
                    >
                      {isAvatarBusy
                        ? "Processando..."
                        : "Adicionar/alterar foto"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeAvatar()}
                      disabled={isAvatarBusy || !userInfo?.avatarUrl}
                      className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark text-gray-900 dark:text-gray-100 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      role="menuitem"
                    >
                      Remover foto
                    </button>
                  </div>
                </div>
              ) : null}
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
