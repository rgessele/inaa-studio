import type { NextRequest } from "next/server";
import {
  processHotmartWebhook,
  validateHotmartHottok,
} from "@/lib/hotmart/webhook";

export async function POST(req: NextRequest): Promise<Response> {
  const hottok = req.headers.get("x-hotmart-hottok");
  if (!validateHotmartHottok(hottok)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = await processHotmartWebhook("purchase", payload);

  if (result.status === "failed") {
    return Response.json(result, { status: 500 });
  }

  return Response.json(result, { status: 200 });
}
