"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/utils/toast";

type Props = {
  userId: string;
  displayName: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  sizeClassName?: string;
  showOnlineIndicator?: boolean;
};

export function UserAvatarMenu(props: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(props.avatarUrl);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAvatarUrl(props.avatarUrl);
  }, [props.avatarUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast("Escolha uma imagem (PNG/JPG/WebP).", "error");
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        toast("A imagem deve ter no máximo 3MB.", "error");
        return;
      }

      setIsBusy(true);
      try {
        const supabase = createClient();
        const path = `${props.userId}/avatar`;

        const uploadRes = await supabase.storage
          .from("avatars")
          .upload(path, file, {
            upsert: true,
            contentType: file.type,
          });

        if (uploadRes.error) {
          toast("Não foi possível enviar sua foto.", "error");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);

        const nextUrl = publicUrlData.publicUrl
          ? `${publicUrlData.publicUrl}?v=${Date.now()}`
          : null;

        const updateRes = await supabase
          .from("profiles")
          .update({ avatar_url: nextUrl })
          .eq("id", props.userId);

        if (updateRes.error) {
          toast("Não foi possível salvar sua foto no perfil.", "error");
          return;
        }

        try {
          await supabase.auth.updateUser({
            data: nextUrl ? { avatar_url: nextUrl } : {},
          });
        } catch {
          // best-effort only
        }

        setAvatarUrl(nextUrl);
        toast("Foto de perfil atualizada!", "success");
      } finally {
        setIsBusy(false);
      }
    },
    [props.userId]
  );

  const removeAvatar = useCallback(async () => {
    setIsBusy(true);
    try {
      const supabase = createClient();
      const path = `${props.userId}/avatar`;

      await supabase.storage.from("avatars").remove([path]);

      const updateRes = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", props.userId);

      if (updateRes.error) {
        toast("Não foi possível remover a foto do perfil.", "error");
        return;
      }

      try {
        await supabase.auth.updateUser({ data: { avatar_url: null } });
      } catch {
        // best-effort only
      }

      setAvatarUrl(null);
      toast("Foto de perfil removida.", "success");
    } finally {
      setIsBusy(false);
    }
  }, [props.userId]);

  const sizeClassName = props.sizeClassName ?? "h-10 w-10";
  const showOnlineIndicator = props.showOnlineIndicator ?? true;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative group cursor-pointer"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Abrir menu do perfil"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Foto de perfil"
            className={`${sizeClassName} rounded-full object-cover shadow-subtle border-2 border-white dark:border-gray-700`}
          />
        ) : (
          <div
            className={`${sizeClassName} rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold shadow-subtle border-2 border-white dark:border-gray-700`}
          >
            {props.initials || "U"}
          </div>
        )}
        {showOnlineIndicator ? (
          <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-surface-dark" />
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shadow-lg overflow-hidden z-50"
          role="menu"
        >
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Foto de perfil"
                className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent-gold flex items-center justify-center text-white font-semibold border border-gray-200 dark:border-gray-700">
                {props.initials || "U"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {props.displayName || "Usuário"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {props.email || ""}
              </p>
            </div>
          </div>

          <div className="p-3 space-y-2">
            <input
              ref={fileInputRef}
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
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="w-full h-9 rounded-md bg-primary hover:bg-primary-hover text-white text-xs font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              role="menuitem"
            >
              {isBusy ? "Processando..." : "Adicionar/alterar foto"}
            </button>

            <button
              type="button"
              onClick={() => void removeAvatar()}
              disabled={isBusy || !avatarUrl}
              className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-surface-dark text-gray-900 dark:text-gray-100 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              role="menuitem"
            >
              Remover foto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
