import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // E2E bypass (Playwright): enabled only when explicitly opted-in.
  // This keeps production secure while allowing stable editor E2E tests.
  const e2eEnabled = process.env.E2E_TESTS === "1";
  const isProd = process.env.NODE_ENV === "production";
  const e2eToken = process.env.E2E_TOKEN;
  const requestToken = request.headers.get("x-e2e-token");
  if (!isProd && e2eEnabled && e2eToken && requestToken === e2eToken) {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase is not configured, keep dev usable, but avoid exposing
    // protected routes in production.
    const pathname = request.nextUrl.pathname;
    const isPublic =
      pathname === "/" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/api/webhooks/hotmart");
    if (!isPublic && isProd) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/webhooks/hotmart");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If migrations are applied, enforce blocked/expired access and gate /admin.
  // This is intentionally defensive: missing columns/RPCs should not crash.
  if (user) {
    // Bootstrap reserved admin emails: promote on first login.
    // Uses a SECURITY DEFINER RPC when available.
    const email = (user.email ?? "").toLowerCase();
    const isReservedAdmin =
      email === "admin@inaastudio.com.br" ||
      email === "admin@comunidadeinaa.com.br";
    if (isReservedAdmin) {
      try {
        await supabase.rpc("ensure_bootstrap_admin");
      } catch {
        // Ignore if RPC doesn't exist yet.
      }
    }

    type ProfileAccessRow = {
      role?: string | null;
      status?: string | null;
      blocked?: boolean | null;
      access_expires_at?: string | null;
    };

    let profile: ProfileAccessRow | null = null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role, status, blocked, access_expires_at")
        .eq("id", user.id)
        .single();
      profile = (data as ProfileAccessRow | null) ?? null;
    } catch {
      profile = null;
    }

    const role = profile?.role ?? null;
    const status = profile?.status ?? "active";
    const blocked = profile?.blocked ?? false;
    const accessExpiresAt = profile?.access_expires_at
      ? new Date(profile.access_expires_at)
      : null;
    const isExpired = accessExpiresAt
      ? accessExpiresAt.getTime() <= Date.now()
      : false;
    const isInactive = status !== "active";

    if ((blocked || isExpired || isInactive) && !isPublic) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore: we still redirect.
      }

      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set(
        "reason",
        blocked ? "blocked" : isInactive ? "inactive" : "expired"
      );
      return NextResponse.redirect(url);
    }

    const isAdminRoute = pathname.startsWith("/admin");
    if (isAdminRoute && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // User is either public, authenticated, or explicitly allowed (E2E bypass).

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse;
}
