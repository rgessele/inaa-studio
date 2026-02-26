export const SUPPORT_WHATSAPP_URL_SETTING_KEY = "support_whatsapp_url";
export const DEFAULT_SUPPORT_WHATSAPP_URL = "https://wa.me/5541999489679";
export const MEMBERS_AREA_URL_SETTING_KEY = "members_area_url";
export const DEFAULT_MEMBERS_AREA_URL =
  "https://hotmart.com/pt-br/club/comunidadeinaa";

export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

export function resolveSupportWhatsappUrl(
  raw: string | null | undefined
): string {
  return normalizeHttpUrl(raw) ?? DEFAULT_SUPPORT_WHATSAPP_URL;
}

export function resolveMembersAreaUrl(raw: string | null | undefined): string {
  return normalizeHttpUrl(raw) ?? DEFAULT_MEMBERS_AREA_URL;
}
