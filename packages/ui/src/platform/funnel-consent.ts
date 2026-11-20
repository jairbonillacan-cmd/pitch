export type ClientFunnelStage = "landing" | "signup_step1";

export const ANALYTICS_CONSENT_STORAGE_KEY = "pitchlab.analytics.consent";
export const ANALYTICS_SID_STORAGE_KEY = "pitchlab.analytics.sid";
const FUNNEL_SENT_PREFIX = "pitchlab.funnel.sent.";

function generateAnonymousSid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pl-${crypto.randomUUID()}`;
  }
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasLocalAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Guarda o borra la autorización local de analítica anónima; nunca crea ID si no se aceptó. */
export function syncLocalAnalyticsConsent(consented: boolean): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (!consented) {
      window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
      window.localStorage.removeItem(ANALYTICS_SID_STORAGE_KEY);
      return null;
    }
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "1");
    let sid = window.localStorage.getItem(ANALYTICS_SID_STORAGE_KEY);
    if (!sid || sid.length < 8) {
      sid = generateAnonymousSid();
      window.localStorage.setItem(ANALYTICS_SID_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

/** Envía un hito del embudo propio solo si la persona aceptó `analyticsConsent`. */
export function sendConsentGatedFunnelStage(
  stage: ClientFunnelStage,
  sourcePath: string,
): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  if (!hasLocalAnalyticsConsent()) return;

  try {
    const sentKey = `${FUNNEL_SENT_PREFIX}${stage}`;
    if (window.sessionStorage.getItem(sentKey) === "1") return;
    const anonymousSessionId = syncLocalAnalyticsConsent(true);
    if (!anonymousSessionId) return;
    window.sessionStorage.setItem(sentKey, "1");
    void fetch("/api/analytics/funnel", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        consent: true,
        anonymousSessionId,
        sourcePath,
      }),
    }).catch(() => undefined);
  } catch {
    // Graceful no-op when storage is blocked.
  }
}
