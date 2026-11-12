/**
 * Verificación en servidor de Cloudflare Turnstile para el alta (escudo anti-abuso $0).
 * Requiere TURNSTILE_SECRET_KEY. Sin clave en producción, el alta debe bloquearse.
 */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  reason?: string;
  rayId?: string;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  options: { secret?: string; remoteIp?: string; expectedAction?: string; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileResult> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "turnstile_no_configurado" };
  if (!token) return { ok: false, reason: "falta_token" };

  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);
  const res = await (options.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, { method: "POST", body });
  if (!res.ok) return { ok: false, reason: `turnstile_http_${res.status}` };
  const json = (await res.json()) as {
    success?: boolean;
    action?: string;
    "error-codes"?: string[];
    cdata?: string;
    metadata?: { ephemeral_id?: string };
  };
  if (!json.success) return { ok: false, reason: (json["error-codes"] ?? ["rechazado"]).join(",") };
  if (options.expectedAction && json.action !== options.expectedAction) {
    return { ok: false, reason: "accion_distinta" };
  }
  return { ok: true, rayId: json.metadata?.ephemeral_id };
}
