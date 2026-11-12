/**
 * Cloudflare Turnstile en el navegador (escudo anti-abuso del enlace mágico).
 *
 * Invisible: solo aparece un recuadro abajo al centro si Cloudflare necesita que la persona
 * confirme que no es un robot. Se activa con NEXT_PUBLIC_TURNSTILE_SITE_KEY; sin ella devuelve
 * null y la petición sale sin token (el servidor tampoco lo exige sin su clave secreta).
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_ACTION_MAGIC_LINK = "magic_link";
const TOKEN_TIMEOUT_MS = 60_000;

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => {
      scriptPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return key && key.trim() ? key.trim() : null;
}

/** Pide un token de un solo uso; null si no hay clave pública o Cloudflare no respondió. */
export async function getTurnstileToken(action: string = TURNSTILE_ACTION_MAGIC_LINK): Promise<string | null> {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return null;
  const api = await loadTurnstile();
  if (!api) return null;

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("data-turnstile-host", "");
    Object.assign(host.style, {
      position: "fixed",
      left: "50%",
      bottom: "16px",
      transform: "translateX(-50%)",
      zIndex: "2147483000",
    });
    document.body.appendChild(host);

    let widgetId: string | null = null;
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        if (widgetId) api.remove(widgetId);
      } catch (err) {
        void err;
      }
      host.remove();
      resolve(token);
    };
    const timer = window.setTimeout(() => finish(null), TOKEN_TIMEOUT_MS);

    try {
      widgetId = api.render(host, {
        sitekey: siteKey,
        action,
        appearance: "interaction-only",
        theme: "auto",
        language: "es",
        callback: (token: string) => finish(token),
        "error-callback": () => finish(null),
        "expired-callback": () => finish(null),
        "timeout-callback": () => finish(null),
      });
    } catch (err) {
      void err;
      finish(null);
    }
  });
}
