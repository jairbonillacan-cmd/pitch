import { createHash } from "node:crypto";

export type SecurityLogLevel = "info" | "warn" | "error";

const MAX_STRING_LENGTH = 512;
const MAX_OBJECT_DEPTH = 5;
const MAX_OBJECT_KEYS = 40;
const MAX_ARRAY_ITEMS = 32;

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const AUTH_SCHEME_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const COOKIE_HEADER_RE = /\b(set-cookie|cookie)\s*:\s*[^\r\n]+/gi;
const COOKIE_PAIR_RE =
  /\b((?:better-auth|pl_beta|__Secure-|__Host-|session|sid|csrf|token|auth)[A-Za-z0-9._-]*)=([^;\s]+)/gi;
const SECRET_PREFIX_RE =
  /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]{8,}|(?:whsec|ghp|gho|glpat)_[A-Za-z0-9_-]{8,}|re_[A-Za-z0-9]{12,})\b/g;
const GOOGLE_TOKEN_RE = /\bya29\.[A-Za-z0-9._-]{10,}\b/g;
const INLINE_SECRET_RE =
  /\b(password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|authorization|clabe|spei[_-]?reference)\s*([=:])\s*([^\s&,;"'}\]]+)/gi;
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const STACK_FRAME_RE = /\r?\n\s+at\s+[^\r\n]+/g;

const EXACT_SENSITIVE_KEY_RE =
  /^(?:password|passwd|secret|token|accessToken|refreshToken|idToken|apiKey|api_key|authorization|cookie|set-cookie|setCookie|sessionToken|session_token|privateKey|private_key|email|userEmail|billingEmail|rfc|birthDate|birth_date|ip|clientIp|remoteAddress|clabe|speiReference|spei_reference)$/i;
const PARTIAL_SENSITIVE_KEY_RE =
  /(?:password|passwd|secret|cookie|authorization|apikey|api_key|access_token|refresh_token|id_token|private_key|jwt|bearer|stacktrace|clabe|speireference|spei_reference)/i;
const STACK_KEY_RE = /^stack$/i;

function auditIpSalt(): string {
  const explicit = process.env.PITCHLAB_AUDIT_SALT?.trim();
  if (explicit) return explicit;
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (authSecret) return authSecret;
  return "pitchlab-audit-salt";
}

export function hashIpForAudit(ip: string): string {
  const normalized = typeof ip === "string" ? ip.trim().toLowerCase() : "";
  const subject = normalized || "unknown";
  return createHash("sha256")
    .update(`${auditIpSalt()}|ip|${subject}`)
    .digest("hex")
    .slice(0, 16);
}

function redactSensitiveString(raw: string): string {
  let out = raw
    .replace(URL_CREDENTIALS_RE, "$1[REDACTED]:[REDACTED]@")
    .replace(JWT_RE, "[REDACTED_JWT]")
    .replace(AUTH_SCHEME_RE, "$1 [REDACTED_TOKEN]")
    .replace(COOKIE_HEADER_RE, "$1: [REDACTED_COOKIE]")
    .replace(COOKIE_PAIR_RE, "$1=[REDACTED_COOKIE]")
    .replace(SECRET_PREFIX_RE, "[REDACTED_SECRET]")
    .replace(GOOGLE_TOKEN_RE, "[REDACTED_SECRET]")
    .replace(INLINE_SECRET_RE, "$1$2[REDACTED]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(STACK_FRAME_RE, "");

  const stackBoundary = out.search(/\r?\n\s*at\s+/);
  if (stackBoundary >= 0) {
    out = out.slice(0, stackBoundary);
  }

  out = out.trim();
  if (out.length > MAX_STRING_LENGTH) {
    return `${out.slice(0, MAX_STRING_LENGTH)}...`;
  }
  return out;
}

function isSensitiveKey(key: string): boolean {
  return EXACT_SENSITIVE_KEY_RE.test(key) || PARTIAL_SENSITIVE_KEY_RE.test(key);
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactSensitiveString(value);
  if (typeof value === "symbol" || typeof value === "function") return "[OMITTED]";

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (value instanceof Error) {
    return {
      name: redactSensitiveString(value.name || "Error"),
      message: redactSensitiveString(value.message || "error"),
    };
  }

  if (depth >= MAX_OBJECT_DEPTH) {
    return "[TRUNCATED]";
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (value instanceof Headers) {
      const redactedHeaders: Record<string, string> = {};
      let count = 0;
      for (const [k, v] of value.entries()) {
        if (count >= MAX_OBJECT_KEYS) break;
        count += 1;
        redactedHeaders[k] = isSensitiveKey(k) ? "[REDACTED]" : redactSensitiveString(v);
      }
      return redactedHeaders;
    }

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactInner(item, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    const limit = Math.min(entries.length, MAX_OBJECT_KEYS);
    for (let i = 0; i < limit; i += 1) {
      const entry = entries[i];
      if (!entry) continue;
      const [key, item] = entry;
      if (STACK_KEY_RE.test(key)) {
        result[key] = "[REDACTED_STACK]";
      } else if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactInner(item, depth + 1, seen);
      }
    }
    return result;
  }

  return "[OMITTED]";
}

export function redactSensitiveValue(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet<object>());
}

export function logSecurityEvent(
  level: SecurityLogLevel,
  event: string,
  meta?: Record<string, unknown>,
): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    channel: "pitchlab.security",
    level,
    event: redactSensitiveString(event).slice(0, 120),
  };

  if (meta && Object.keys(meta).length > 0) {
    record.meta = redactSensitiveValue(meta);
  }

  const payload = JSON.stringify(record);
  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.info(payload);
  }
}
