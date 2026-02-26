import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";
import {
  adminSetMembersAreaUrl,
  adminSetSupportWhatsappUrl,
} from "@/app/admin/actions";
import {
  MEMBERS_AREA_URL_SETTING_KEY,
  SUPPORT_WHATSAPP_URL_SETTING_KEY,
  resolveMembersAreaUrl,
  resolveSupportWhatsappUrl,
} from "@/lib/app-settings";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toStr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function decodeMessage(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errorMessage = toStr(sp.error).trim();
  const successMessage = toStr(sp.ok).trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [SUPPORT_WHATSAPP_URL_SETTING_KEY, MEMBERS_AREA_URL_SETTING_KEY]);

  const byKey = new Map(
    ((data ?? []) as Array<{ key: string; value: string | null }>).map((row) => [
      row.key,
      row.value,
    ])
  );

  const supportUrl = resolveSupportWhatsappUrl(
    (byKey.get(SUPPORT_WHATSAPP_URL_SETTING_KEY) as string | null) ?? null
  );
  const membersAreaUrl = resolveMembersAreaUrl(
    (byKey.get(MEMBERS_AREA_URL_SETTING_KEY) as string | null) ?? null
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Parâmetros globais administráveis da plataforma.
        </p>
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
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
          Falha ao carregar a configuração atual: {error.message}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Suporte
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          URL usada no botão de ajuda (ícone ao lado do modo escuro).
        </p>

        <form action={updateSupportWhatsappUrlFormAction} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="support_whatsapp_url"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              URL de suporte (WhatsApp)
            </label>
            <input
              id="support_whatsapp_url"
              name="support_whatsapp_url"
              type="url"
              required
              defaultValue={supportUrl}
              placeholder="https://wa.me/5541999489679"
              className="w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Exemplo: https://wa.me/5541999489679
            </p>
          </div>

          <FormSubmitButton
            idleText="Salvar configuração"
            pendingText="Salvando..."
            className="h-9 px-4 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium"
          />
        </form>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Área de membros
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          URL usada no ícone de área de membros (ao lado do modo escuro).
        </p>

        <form action={updateMembersAreaUrlFormAction} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="members_area_url"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              URL da área de membros
            </label>
            <input
              id="members_area_url"
              name="members_area_url"
              type="url"
              required
              defaultValue={membersAreaUrl}
              placeholder="https://hotmart.com/pt-br/club/comunidadeinaa"
              className="w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Exemplo: https://hotmart.com/pt-br/club/comunidadeinaa
            </p>
          </div>

          <FormSubmitButton
            idleText="Salvar configuração"
            pendingText="Salvando..."
            className="h-9 px-4 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium"
          />
        </form>
      </div>
    </div>
  );
}

async function updateSupportWhatsappUrlFormAction(formData: FormData) {
  "use server";

  const rawUrl = String(formData.get("support_whatsapp_url") ?? "");

  try {
    await adminSetSupportWhatsappUrl(rawUrl);
    redirect(
      `/admin/settings?ok=${encodeURIComponent("Configuração salva com sucesso.")}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar configuração.";
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }
}

async function updateMembersAreaUrlFormAction(formData: FormData) {
  "use server";

  const rawUrl = String(formData.get("members_area_url") ?? "");

  try {
    await adminSetMembersAreaUrl(rawUrl);
    redirect(
      `/admin/settings?ok=${encodeURIComponent("Configuração salva com sucesso.")}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar configuração.";
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }
}
