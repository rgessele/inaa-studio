import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SECRET_API_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !adminKey) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and one of SUPABASE_SECRET_KEY / SUPABASE_SECRET_API_KEY / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
