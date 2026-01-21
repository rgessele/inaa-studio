"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function loginWithPassword(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect("/login?error=invalid");
  }

  // Defensive: if migrations/columns aren't there yet, just send user to dashboard.
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, blocked, access_expires_at")
      .eq("id", data.user.id)
      .single();

    const role = (profile?.role as string | null) ?? null;
    const status = (profile?.status as string | null) ?? "active";
    const blocked = Boolean(profile?.blocked);
    const accessExpiresAtRaw = (profile?.access_expires_at as string | null) ?? null;
    const accessExpiresAt = accessExpiresAtRaw ? new Date(accessExpiresAtRaw) : null;
    const isExpired = accessExpiresAt ? accessExpiresAt.getTime() <= Date.now() : false;

    if (blocked || isExpired || status !== "active") {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore; redirect anyway.
      }

      const reason = blocked ? "blocked" : status !== "active" ? "inactive" : "expired";
      redirect(`/login?reason=${encodeURIComponent(reason)}`);
    }

    if (role === "admin") {
      redirect("/admin");
    }
  } catch {
    // ignore
  }

  redirect("/dashboard");
}
