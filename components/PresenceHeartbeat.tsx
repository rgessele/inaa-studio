"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function PresenceHeartbeat() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const supabase = createClient();

    const tick = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) return;

        const route =
          typeof window !== "undefined" ? window.location.pathname : null;

        await supabase.from("user_presence").upsert(
          {
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            route,
          },
          { onConflict: "user_id" }
        );
      } catch {
        // Best-effort.
      }
    };

    const start = () => {
      void tick();
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
      }
      timerRef.current = window.setInterval(() => {
        void tick();
      }, 60_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    start();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
