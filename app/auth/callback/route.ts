import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Best-effort bootstrap for reserved admin emails (if RPC exists).
    try {
      await supabase.rpc("ensure_bootstrap_admin");
    } catch {
      // Ignore if RPC doesn't exist yet.
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "admin") {
          return NextResponse.redirect(`${origin}/admin`);
        }
      } catch {
        // Ignore and fall back to dashboard.
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/dashboard`);
}
