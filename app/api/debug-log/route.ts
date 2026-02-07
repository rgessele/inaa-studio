import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest): Promise<Response> {
  if (process.env.DEBUG !== "true" || process.env.NODE_ENV === "production") {
    return new Response(null, { status: 204 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const dir = join(process.cwd(), ".debug");
  const file = join(dir, "figure-events.log");

  try {
    await mkdir(dir, { recursive: true });
    await appendFile(file, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
