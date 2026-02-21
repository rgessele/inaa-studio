"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationType = "info" | "warning" | "urgent";

type UserNotificationRow = {
  id: string;
  notificationId: string;
  deliveredAt: string;
  readAt: string | null;
  title: string;
  body: string;
  type: NotificationType;
  actionUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  sentAt: string | null;
};

type AdminNotificationDetail = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  action_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  sent_at: string | null;
};

type Props = {
  className?: string;
};

const POLL_MS = 30_000;
const MAX_ITEMS = 30;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function asSingleObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function clampBadge(value: number): string {
  if (value <= 0) return "";
  if (value > 99) return "99+";
  return String(value);
}

function parseIsoToMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function dedupeNotificationsByNotificationId(
  rows: UserNotificationRow[]
): UserNotificationRow[] {
  const byNotification = new Map<string, UserNotificationRow>();

  for (const row of rows) {
    const current = byNotification.get(row.notificationId);
    if (!current) {
      byNotification.set(row.notificationId, row);
      continue;
    }

    const currentMs = parseIsoToMs(current.deliveredAt);
    const nextMs = parseIsoToMs(row.deliveredAt);
    const base = nextMs >= currentMs ? row : current;

    // If any duplicate is unread, keep the merged row as unread.
    const mergedReadAt =
      current.readAt !== null && row.readAt !== null ? base.readAt : null;

    byNotification.set(row.notificationId, {
      ...base,
      readAt: mergedReadAt,
    });
  }

  return Array.from(byNotification.values()).sort(
    (a, b) => parseIsoToMs(b.deliveredAt) - parseIsoToMs(a.deliveredAt)
  );
}

export function NotificationBell({ className }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UserNotificationRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dispatchThrottleAtRef = useRef(0);

  const badge = clampBadge(unreadCount);
  const hasUnread = unreadCount > 0;

  const refresh = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setErrorMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setErrorMessage(userError.message);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setUnreadCount(0);
      setItems([]);
      setIsLoading(false);
      return;
    }

    const now = Date.now();
    if (now - dispatchThrottleAtRef.current > 60_000) {
      dispatchThrottleAtRef.current = now;
      try {
        await fetch("/api/notifications/dispatch-due", {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Best-effort only.
      }
    }

    const joined = await supabase
      .from("user_notifications")
      .select(
        "id, notification_id, delivered_at, read_at, admin_notifications!user_notifications_notification_id_fkey(id, title, body, type, action_url, image_url, image_alt, sent_at)"
      )
      .order("delivered_at", { ascending: false })
      .limit(MAX_ITEMS);

    if (!joined.error) {
      const mapped = (joined.data ?? [])
        .map((row) => {
          const notification = asSingleObject(
            row.admin_notifications as
              | AdminNotificationDetail
              | AdminNotificationDetail[]
              | null
          );

          if (!notification) return null;
          return {
            id: row.id as string,
            notificationId: row.notification_id as string,
            deliveredAt: row.delivered_at as string,
            readAt: (row.read_at as string | null) ?? null,
            title: notification.title,
            body: notification.body,
            type: notification.type,
            actionUrl: notification.action_url,
            imageUrl: notification.image_url,
            imageAlt: notification.image_alt,
            sentAt: notification.sent_at,
          } satisfies UserNotificationRow;
        })
        .filter((value): value is UserNotificationRow => Boolean(value));

      const deduped = dedupeNotificationsByNotificationId(mapped);
      setItems(deduped);
      setUnreadCount(deduped.filter((item) => item.readAt === null).length);
      setIsLoading(false);
      return;
    }

    // Fallback if relationship cache isn't available yet.
    const baseRows = await supabase
      .from("user_notifications")
      .select("id, notification_id, delivered_at, read_at")
      .order("delivered_at", { ascending: false })
      .limit(MAX_ITEMS);

    if (baseRows.error) {
      setErrorMessage(baseRows.error.message);
      setIsLoading(false);
      return;
    }

    const ids = (baseRows.data ?? [])
      .map((row) => row.notification_id as string)
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(ids));

    let byId = new Map<
      string,
      AdminNotificationDetail
    >();
    if (uniqueIds.length > 0) {
      const details = await supabase
        .from("admin_notifications")
        .select("id, title, body, type, action_url, image_url, image_alt, sent_at")
        .in("id", uniqueIds)
        .eq("status", "sent");

      if (!details.error) {
        const list = (details.data ?? []) as AdminNotificationDetail[];
        byId = new Map(list.map((item) => [item.id, item]));
      }
    }

    const mapped = (baseRows.data ?? [])
      .map((row) => {
        const detail = byId.get(row.notification_id as string);
        if (!detail) return null;
        return {
          id: row.id as string,
          notificationId: row.notification_id as string,
          deliveredAt: row.delivered_at as string,
          readAt: (row.read_at as string | null) ?? null,
          title: detail.title,
          body: detail.body,
          type: detail.type,
          actionUrl: detail.action_url,
          imageUrl: detail.image_url,
          imageAlt: detail.image_alt,
          sentAt: detail.sent_at,
        } satisfies UserNotificationRow;
      })
      .filter((value): value is UserNotificationRow => Boolean(value));

    const deduped = dedupeNotificationsByNotificationId(mapped);
    setItems(deduped);
    setUnreadCount(deduped.filter((item) => item.readAt === null).length);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

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

  const markOneAsRead = useCallback(async (userNotificationId: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_user_notification_read", {
      p_user_notification_id: userNotificationId,
    });
    if (error) return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === userNotificationId
          ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
          : item
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_user_notifications_read");
    if (error) return;
    setItems((prev) =>
      prev.map((item) =>
        item.readAt ? item : { ...item, readAt: new Date().toISOString() }
      )
    );
    setUnreadCount(0);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) void refresh();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10 transition-colors"
        aria-label="Abrir notificações"
        title="Notificações"
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center border border-white dark:border-surface-dark">
            {badge}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Notificações
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {unreadCount > 0
                  ? `${unreadCount} não lida(s)`
                  : "Sem não lidas"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="h-7 px-2 rounded-md border border-gray-300 dark:border-gray-700 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={unreadCount <= 0}
                className="h-7 px-2 rounded-md bg-primary hover:bg-primary-hover text-white text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Marcar todas
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {errorMessage ? (
              <div className="px-4 py-6 text-sm text-red-600 dark:text-red-300">
                {errorMessage}
              </div>
            ) : isLoading && items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                Nenhuma notificação.
              </div>
            ) : (
              items.map((item) => {
                const unread = !item.readAt;
                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 ${
                      unread ? "bg-red-50/40 dark:bg-red-950/10" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (unread) void markOneAsRead(item.id);
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {item.title}
                        </p>
                        {unread ? (
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {fmtDateTime(item.sentAt ?? item.deliveredAt)}
                      </p>
                      <p className="mt-2 text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                        {item.body}
                      </p>
                    </button>

                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.imageAlt || item.title}
                        className="mt-2 max-h-44 rounded-md border border-gray-200 dark:border-gray-700 object-contain bg-black/5 dark:bg-white/5"
                      />
                    ) : null}

                    {item.actionUrl ? (
                      <a
                        href={item.actionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-primary hover:underline"
                      >
                        Abrir link
                      </a>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
