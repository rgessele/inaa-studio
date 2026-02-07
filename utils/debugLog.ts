type DebugLogEvent = {
  type: string;
  payload: unknown;
};

const DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_DEBUG === "true" &&
  process.env.NODE_ENV !== "production";

const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(16).slice(2)}_${Date.now()}`;

export function sendDebugLog(event: DebugLogEvent): void {
  if (!DEBUG_ENABLED) return;
  if (typeof window === "undefined") return;

  const body = {
    ts: new Date().toISOString(),
    sessionId,
    ...event,
  };

  console.log("[debug-log]", body);

  void fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
