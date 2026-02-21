import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  adminApplyBulkNotificationAction,
  adminCancelNotification,
  adminCreateNotification,
  adminDeleteNotification,
  adminPublishNotification,
} from "@/app/admin/actions";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";
import { AdminNotificationCreateForm } from "@/components/admin/AdminNotificationCreateForm";
import { ConfirmModalSubmitButton } from "@/components/admin/ConfirmModalSubmitButton";
import { BulkActionSubmitButton } from "@/components/admin/BulkActionSubmitButton";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type NotificationStatus = "draft" | "scheduled" | "sent" | "canceled";
type NotificationType = "info" | "warning" | "urgent";

function toStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function toStatusFilter(raw: string): NotificationStatus | "" {
  if (raw === "draft") return "draft";
  if (raw === "scheduled") return "scheduled";
  if (raw === "sent") return "sent";
  if (raw === "canceled") return "canceled";
  return "";
}

function decodeMessage(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function statusBadgeClass(status: NotificationStatus): string {
  if (status === "sent") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
  if (status === "scheduled") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  }
  if (status === "canceled") {
    return "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
  return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
}

function statusLabel(status: NotificationStatus): string {
  if (status === "sent") return "Enviada";
  if (status === "scheduled") return "Agendada";
  if (status === "canceled") return "Cancelada";
  return "Rascunho";
}

function typeLabel(type: NotificationType): string {
  if (type === "urgent") return "Urgente";
  if (type === "warning") return "Aviso";
  return "Info";
}

function typeBadgeClass(type: NotificationType): string {
  if (type === "urgent") {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
  if (type === "warning") {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  }
  return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const statusFilter = toStatusFilter(toStr(sp.status).trim());
  const errorMessage = toStr(sp.error).trim();
  const successMessage = toStr(sp.ok).trim();

  const supabase = await createClient();

  let query = supabase
    .from("admin_notifications")
    .select(
      "id, title, body, type, status, action_url, image_url, image_alt, created_at, scheduled_at, sent_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    body: string;
    type: NotificationType;
    status: NotificationStatus;
    action_url: string | null;
    image_url: string | null;
    image_alt: string | null;
    created_at: string;
    scheduled_at: string | null;
    sent_at: string | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
            Notificações
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Mensagens in-app para todos os usuários (com agendamento e imagem
            opcional).
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200">
          {decodeMessage(errorMessage)}
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-200">
          {decodeMessage(successMessage)}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Nova notificação
        </h2>
        <AdminNotificationCreateForm action={createNotificationFormAction} />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-4">
        <form method="get" className="flex items-center gap-3">
          <label htmlFor="status" className="text-sm font-medium">
            Filtrar status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="scheduled">Agendada</option>
            <option value="sent">Enviada</option>
            <option value="canceled">Cancelada</option>
          </select>
          <button
            type="submit"
            className="h-9 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm"
          >
            Aplicar
          </button>
          <Link
            href="/admin/notifications"
            className="text-sm text-gray-600 dark:text-gray-300 hover:underline"
          >
            Limpar
          </Link>
        </form>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-4">
        <form id="bulk-actions-form" action={bulkNotificationFormAction} className="flex flex-wrap items-center gap-3">
          <label htmlFor="bulk_action" className="text-sm font-medium">
            Ação em massa
          </label>
          <select
            id="bulk_action"
            name="bulk_action"
            required
            defaultValue=""
            className="h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="" disabled>
              Selecione uma ação
            </option>
            <option value="publish">Publicar selecionadas</option>
            <option value="cancel">Cancelar selecionadas</option>
            <option value="delete">Apagar selecionadas</option>
          </select>
          <BulkActionSubmitButton className="h-9 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Marque as mensagens abaixo e aplique a ação escolhida.
          </p>
        </form>
      </div>

      <div className="space-y-3">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200">
            Erro ao carregar notificações: {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark px-4 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
            Nenhuma notificação encontrada.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-4"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="notification_ids"
                  value={row.id}
                  form="bulk-actions-form"
                  className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-700 accent-primary"
                  aria-label={`Selecionar ${row.title}`}
                />

                <details className="flex-1">
                  <summary className="cursor-pointer select-none text-sm text-gray-900 dark:text-gray-100">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{row.title}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeBadgeClass(row.type)}`}
                      >
                        {typeLabel(row.type)}
                      </span>
                    </span>
                  </summary>

                  <div className="mt-3 pl-1">
                    <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {row.body}
                    </p>

                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image_url}
                        alt={row.image_alt || row.title}
                        className="mt-3 max-h-48 rounded-lg border border-gray-200 dark:border-gray-700 object-contain bg-black/5 dark:bg-white/5"
                      />
                    ) : null}

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <p>Criada: {fmtDateTime(row.created_at)}</p>
                      <p>Agendada: {fmtDateTime(row.scheduled_at)}</p>
                      <p>Enviada: {fmtDateTime(row.sent_at)}</p>
                    </div>

                    {row.action_url ? (
                      <p className="mt-2 text-xs">
                        <a
                          href={row.action_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {row.action_url}
                        </a>
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {row.status === "draft" || row.status === "scheduled" ? (
                        <>
                          {row.status !== "sent" ? (
                            <form action={publishNotificationFormAction}>
                              <input type="hidden" name="notification_id" value={row.id} />
                              <FormSubmitButton
                                idleText="Publicar agora"
                                pendingText="Publicando..."
                                className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                              />
                            </form>
                          ) : null}
                          <form action={cancelNotificationFormAction}>
                            <input type="hidden" name="notification_id" value={row.id} />
                            <FormSubmitButton
                              idleText="Cancelar"
                              pendingText="Cancelando..."
                              className="h-8 px-3 rounded-md border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                            />
                          </form>
                        </>
                      ) : null}
                      <form action={deleteNotificationFormAction}>
                        <input type="hidden" name="notification_id" value={row.id} />
                        <ConfirmModalSubmitButton
                          idleText="Apagar"
                          pendingText="Apagando..."
                          className="h-8 px-3 rounded-md border border-red-300 dark:border-red-900/40 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                          confirmTitle="Apagar notificação"
                          confirmDescription="Tem certeza que deseja apagar esta notificação? Se ela já foi enviada, será removida da lista de todos os usuários."
                        />
                      </form>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function createNotificationFormAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const type = String(formData.get("type") ?? "info");
  const actionUrl = String(formData.get("action_url") ?? "");
  const deliveryMode = String(formData.get("delivery_mode") ?? "now");
  const scheduledAtLocal = String(formData.get("scheduled_at_local") ?? "");
  const imageAlt = String(formData.get("image_alt") ?? "");
  const imageEntry = formData.get("image");
  const imageFile =
    imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  let scheduledAtIso: string | null = null;
  if (deliveryMode === "schedule" && scheduledAtLocal.trim()) {
    scheduledAtIso = new Date(scheduledAtLocal).toISOString();
  }

  try {
    await adminCreateNotification({
      title,
      body,
      type,
      actionUrl: actionUrl || null,
      deliveryMode,
      scheduledAtIso,
      imageFile,
      imageAlt: imageAlt || null,
    });
    redirect(
      `/admin/notifications?ok=${encodeURIComponent(
        deliveryMode === "schedule"
          ? "Notificação agendada com sucesso."
          : "Notificação publicada com sucesso."
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao criar notificação.";
    redirect(`/admin/notifications?error=${encodeURIComponent(message)}`);
  }
}

async function publishNotificationFormAction(formData: FormData) {
  "use server";

  const id = String(formData.get("notification_id") ?? "");
  try {
    await adminPublishNotification(id);
    redirect(
      `/admin/notifications?ok=${encodeURIComponent(
        "Notificação publicada com sucesso."
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao publicar notificação.";
    redirect(`/admin/notifications?error=${encodeURIComponent(message)}`);
  }
}

async function cancelNotificationFormAction(formData: FormData) {
  "use server";

  const id = String(formData.get("notification_id") ?? "");
  try {
    await adminCancelNotification(id);
    redirect(
      `/admin/notifications?ok=${encodeURIComponent(
        "Notificação cancelada com sucesso."
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao cancelar notificação.";
    redirect(`/admin/notifications?error=${encodeURIComponent(message)}`);
  }
}

async function deleteNotificationFormAction(formData: FormData) {
  "use server";

  const id = String(formData.get("notification_id") ?? "");
  try {
    await adminDeleteNotification(id);
    redirect(
      `/admin/notifications?ok=${encodeURIComponent(
        "Notificação apagada com sucesso."
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao apagar notificação.";
    redirect(`/admin/notifications?error=${encodeURIComponent(message)}`);
  }
}

async function bulkNotificationFormAction(formData: FormData) {
  "use server";

  const action = String(formData.get("bulk_action") ?? "");
  const ids = formData
    .getAll("notification_ids")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  try {
    const result = await adminApplyBulkNotificationAction({
      action,
      notificationIds: ids,
    });
    const actionLabel =
      result.action === "publish"
        ? "publicada(s)"
        : result.action === "cancel"
          ? "cancelada(s)"
          : "apagada(s)";
    redirect(
      `/admin/notifications?ok=${encodeURIComponent(
        `Ação em massa concluída: ${result.ok} ${actionLabel}.`
      )}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha na ação em massa.";
    redirect(`/admin/notifications?error=${encodeURIComponent(message)}`);
  }
}
