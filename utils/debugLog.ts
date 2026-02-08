type DebugLogEvent = {
  type: string;
  payload: unknown;
};

const DEBUG_ENV_ENABLED =
  process.env.NEXT_PUBLIC_DEBUG === "true" &&
  process.env.NODE_ENV !== "production";

const DEBUG_RUNTIME_KEY = "inaa:debugLogsEnabled";

function isE2EAutomationActive(): boolean {
  return (
    process.env.NEXT_PUBLIC_E2E_TESTS === "1" &&
    typeof navigator !== "undefined" &&
    navigator.webdriver === true
  );
}

const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(16).slice(2)}_${Date.now()}`;

function parseBoolish(
  raw: string
): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "off")
    return false;
  return null;
}

export function isDebugLogEnabled(): boolean {
  const e2eAutomation = isE2EAutomationActive();
  if (!DEBUG_ENV_ENABLED && !e2eAutomation) return false;
  if (typeof window === "undefined") return false;

  // Keep E2E deterministic even if a previous test mutates localStorage.
  if (e2eAutomation) return true;

  try {
    const stored = window.localStorage.getItem(DEBUG_RUNTIME_KEY);
    if (stored == null) return true;
    const parsed = parseBoolish(stored);
    return parsed ?? true;
  } catch {
    return true;
  }
}

export function sendDebugLog(event: DebugLogEvent): void {
  if (!isDebugLogEnabled()) return;

  const body = {
    ts: new Date().toISOString(),
    sessionId,
    ...event,
  };

  console.debug("[debug-log]", body);

  void fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
