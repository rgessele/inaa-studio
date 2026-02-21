"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SUPPORT_WHATSAPP_URL,
  SUPPORT_WHATSAPP_URL_SETTING_KEY,
  resolveSupportWhatsappUrl,
} from "@/lib/app-settings";

type SupportHelpButtonProps = {
  className?: string;
  iconClassName?: string;
};

export function SupportHelpButton({
  className,
  iconClassName,
}: SupportHelpButtonProps) {
  const [href, setHref] = useState(DEFAULT_SUPPORT_WHATSAPP_URL);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SUPPORT_WHATSAPP_URL_SETTING_KEY)
        .maybeSingle();

      if (cancelled || error) return;
      setHref(resolveSupportWhatsappUrl((data?.value as string | null) ?? null));
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Ajuda no WhatsApp"
      aria-label="Ajuda no WhatsApp"
      className={[
        "h-9 w-9 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-accent-gold transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5 focus:outline-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={["material-symbols-outlined", iconClassName ?? "text-[20px]"]
          .filter(Boolean)
          .join(" ")}
      >
        help
      </span>
    </a>
  );
}
