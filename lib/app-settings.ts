export const SUPPORT_WHATSAPP_URL_SETTING_KEY = "support_whatsapp_url";
export const DEFAULT_SUPPORT_WHATSAPP_URL = "https://wa.me/5541999489679";

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
