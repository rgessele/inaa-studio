"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_MEMBERS_AREA_URL,
  MEMBERS_AREA_URL_SETTING_KEY,
  resolveMembersAreaUrl,
} from "@/lib/app-settings";

type MembersAreaButtonProps = {
  className?: string;
  iconClassName?: string;
};

export function MembersAreaButton({
  className,
  iconClassName,
}: MembersAreaButtonProps) {
  const [href, setHref] = useState(DEFAULT_MEMBERS_AREA_URL);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", MEMBERS_AREA_URL_SETTING_KEY)
        .maybeSingle();

      if (cancelled || error) return;
      setHref(resolveMembersAreaUrl((data?.value as string | null) ?? null));
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
      title="Área de membros"
      aria-label="Área de membros"
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
        card_membership
      </span>
    </a>
  );
}
