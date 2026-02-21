import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorizedBySecret(req: NextRequest): boolean {
  const expected = (process.env.NOTIFICATIONS_DISPATCH_SECRET ?? "").trim();
  if (!expected) return false;

  const byHeader = (req.headers.get("x-notifications-dispatch-secret") ?? "").trim();
  if (byHeader && byHeader === expected) return true;

  const byQuery = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
  return Boolean(byQuery && byQuery === expected);
}

async function dispatchDue(req: NextRequest): Promise<Response> {
  const viaSecret = isAuthorizedBySecret(req);
  if (!viaSecret) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Não autenticado" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("dispatch_due_admin_notifications", {
    p_limit: 200,
  });

  if (error) {
    return Response.json(
      { error: `Falha ao despachar notificações: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    dispatched: typeof data === "number" ? data : 0,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return dispatchDue(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return dispatchDue(req);
}
