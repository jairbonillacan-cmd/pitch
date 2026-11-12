/**
 * Guardas transversales de seguridad HTTP (SEC-12):
 * - Extracción confiable de IP detrás de Cloudflare / Vercel / proxy reverso.
 * - Verificación estricta de mismo origen (`Origin` + `Sec-Fetch-Site` + `Content-Type`) contra CSRF.
 * - Limitador de tasa atómico en Upstash Redis (`/pipeline` con `INCR` + `PEXPIRE NX`) y respaldo acotado en memoria.
 */
import { NextResponse } from "next/server";

interface MemoryRateEntry {
  count: number;
  resetAt: number;
}

const MAX_MEMORY_ENTRIES = 5_000;
const memoryStore = new Map<string, MemoryRateEntry>();
let warnedMemoryFallback = false;

export function resetRateLimitsForTests(): void {
  memoryStore.clear();
  warnedMemoryFallback = false;
}

function sanitizeIpCandidate(raw: string | null | undefined): string {
  if (!raw) return "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 64) return "";
  if (!/^[0-9a-fA-F:.]+$/.test(candidate)) return "";
  return candidate;
}

/**
 * Prioriza cabeceras inyectadas y sobrescritas por el borde (Cloudflare / Vercel / Nginx)
 * antes de caer en `X-Forwarded-For`, evitando que un cliente falsifique su IP para saltar cuotas.
 */
export function trustedClientIp(headers: Headers): string {
  const cfIp = sanitizeIpCandidate(headers.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  const vercelIp = sanitizeIpCandidate(headers.get("x-vercel-forwarded-for")?.split(",")[0]);
  if (vercelIp) return vercelIp;

  const realIp = sanitizeIpCandidate(headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedFirst = sanitizeIpCandidate(headers.get("x-forwarded-for")?.split(",")[0]);
  return forwardedFirst;
}

/**
 * Rechaza mutaciones cross-site autenticadas por cookie (`POST`, `PUT`, `PATCH`, `DELETE`).
 * Devuelve `null` si la solicitud es legítima o un `NextResponse` 403/415 listo para retornar.
 */
export function verifySameOriginMutation(
  request: Request,
  options: { requireJson?: boolean } = {},
): NextResponse | null {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const rawOrigin = request.headers.get("origin")?.trim();
  if (!rawOrigin || rawOrigin === "null") {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch (err) {
    void err;
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const configuredBase = process.env.BETTER_AUTH_URL?.trim();
  if (configuredBase) {
    try {
      allowedOrigins.add(new URL(configuredBase).origin);
    } catch (err) {
      void err;
    }
  }

  if (!allowedOrigins.has(rawOrigin)) {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  if (options.requireJson !== false) {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      return NextResponse.json({ error: "tipo_contenido_invalido" }, { status: 415 });
    }
  }

  return null;
}

function pruneMemoryStore(nowMs: number): void {
  if (memoryStore.size < MAX_MEMORY_ENTRIES) return;
  for (const [k, v] of memoryStore) {
    if (v.resetAt <= nowMs) memoryStore.delete(k);
    if (memoryStore.size < MAX_MEMORY_ENTRIES * 0.8) return;
  }
  while (memoryStore.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryStore.keys().next().value;
    if (oldest === undefined) break;
    memoryStore.delete(oldest);
  }
}

export interface RateLimitCheckOptions {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Incrementa y consulta de forma atómica el contador de ventana fija en Upstash (`/pipeline`),
 * o en un almacén local acotado si Upstash no está configurado o no responde.
 */
export async function checkEndpointRateLimit(
  options: RateLimitCheckOptions,
): Promise<RateLimitCheckResult> {
  const nowMs = options.nowMs ?? Date.now();
  const safeKey = `pl:rl:${options.bucket}:${(options.key || "unknown").slice(0, 128)}`;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (upstashUrl && upstashToken) {
    try {
      const endpoint = `${upstashUrl.replace(/\/+$/, "")}/pipeline`;
      const res = await (options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", safeKey],
          ["PEXPIRE", safeKey, String(options.windowMs), "NX"],
          ["PTTL", safeKey],
        ]),
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ result?: number }>;
        const count = Number(rows?.[0]?.result ?? 1);
        const ttlMs = Number(rows?.[2]?.result ?? options.windowMs);
        // Si una llave antigua quedó sin expiración (PTTL = -1), forzamos PEXPIRE de inmediato.
        if (ttlMs < 0) {
          await (options.fetchImpl ?? fetch)(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${upstashToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([["PEXPIRE", safeKey, String(options.windowMs)]]),
          });
        }
        const effectiveTtlMs = ttlMs > 0 ? ttlMs : options.windowMs;
        const allowed = count <= options.limit;
        return {
          allowed,
          remaining: Math.max(0, options.limit - count),
          retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(effectiveTtlMs / 1000)),
        };
      }
    } catch (err) {
      void err;
    }
  }

  if (process.env.NODE_ENV === "production" && !warnedMemoryFallback) {
    warnedMemoryFallback = true;
    console.warn(
      "[rate-limit] Usando almacén en memoria: configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en producción.",
    );
  }

  const existing = memoryStore.get(safeKey);
  if (!existing || existing.resetAt <= nowMs) {
    pruneMemoryStore(nowMs);
    memoryStore.set(safeKey, { count: 1, resetAt: nowMs + options.windowMs });
    return {
      allowed: 1 <= options.limit,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds: 1 <= options.limit ? 0 : Math.max(1, Math.ceil(options.windowMs / 1000)),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
  };
}

export function rateLimitResponse(
  retryAfterSeconds: number,
  message: string = "Demasiadas solicitudes. Intenta de nuevo en unos momentos.",
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
        "Cache-Control": "no-store",
      },
    },
  );
}
