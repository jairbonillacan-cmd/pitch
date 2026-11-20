/**
 * Cliente Web Push nativo de Node (RFC 8291 `aes128gcm` + ES256 VAPID) sin dependencias externas.
 */
import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { isIP } from "node:net";
import {
  deleteInvalidPushSubscriptions,
  listPushSubscriptionsForUsers,
  markPushSent,
  type Db,
  type PushTopic,
  type StoredPushSubscription,
} from "@pitchlab/db";

const ALLOWED_WEB_PUSH_EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
]);

const ALLOWED_WEB_PUSH_HOST_SUFFIXES = [
  ".push.apple.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
] as const;

const SUBDOMAIN_PREFIX_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Valida y normaliza un endpoint Web Push contra una allowlist estricta de proveedores
 * reales (FCM, Mozilla Autopush, Apple Web Push, Windows WNS), bloqueando SSRF hacia
 * IPs literales, hosts locales/internos, credenciales embebidas o puertos no estándar.
 */
export function parseAllowedWebPushEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port !== "") return null;

    const host = parsed.hostname.toLowerCase();
    if (!host || host.endsWith(".") || host.includes("..")) return null;
    const unwrapped = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    if (isIP(unwrapped) !== 0) return null;
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return null;
    }
    if (!/^[a-z0-9.-]+$/.test(host)) return null;

    const exactMatch = ALLOWED_WEB_PUSH_EXACT_HOSTS.has(host);
    const suffixMatch =
      !exactMatch &&
      ALLOWED_WEB_PUSH_HOST_SUFFIXES.some((suffix) => {
        if (!host.endsWith(suffix)) return false;
        const prefix = host.slice(0, -suffix.length);
        return prefix.length > 0 && SUBDOMAIN_PREFIX_RE.test(prefix);
      });
    if (!exactMatch && !suffixMatch) return null;

    return parsed.toString();
  } catch (err) {
    void err;
    return null;
  }
}

export function isAllowedWebPushEndpoint(raw: unknown): boolean {
  return parseAllowedWebPushEndpoint(raw) !== null;
}

export interface WebPushMessagePayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badge?: string;
  icon?: string;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:soporte@pitchlab.mx";
  if (!publicKey || !privateKey) return null;
  const pubBytes = Buffer.from(publicKey, "base64url");
  const privBytes = Buffer.from(privateKey, "base64url");
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04 || privBytes.length !== 32) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return vapidConfigFromEnv(env) !== null;
}

/** Firma un JWT ES256 VAPID (`Authorization: vapid t=..., k=...`) conforme a RFC 8292. */
export function buildVapidHeaders(
  endpoint: string,
  vapid: VapidConfig,
  nowMs: number = Date.now(),
): { Authorization: string } {
  const parsed = new URL(endpoint);
  const audience = `${parsed.protocol}//${parsed.host}`;
  const exp = Math.floor(nowMs / 1000) + 12 * 3600;
  const headerB64 = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({ aud: audience, exp, sub: vapid.subject }),
  ).toString("base64url");
  const unsigned = `${headerB64}.${payloadB64}`;

  const pubBuf = Buffer.from(vapid.publicKey, "base64url");
  const privBuf = Buffer.from(vapid.privateKey, "base64url");
  if (pubBuf.length !== 65 || pubBuf[0] !== 0x04 || privBuf.length !== 32) {
    throw new Error("Llaves VAPID P-256 inválidas");
  }

  const keyObj = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: pubBuf.subarray(1, 33).toString("base64url"),
      y: pubBuf.subarray(33, 65).toString("base64url"),
      d: privBuf.toString("base64url"),
    },
    format: "jwk",
  });

  const sig = createSign("SHA256").update(unsigned).sign({
    key: keyObj,
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${unsigned}.${sig.toString("base64url")}`;
  return {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
  };
}

/**
 * Cifra un payload JSON según RFC 8291 (`aes128gcm`) para el endpoint de un navegador.
 */
export function encryptWebPushPayload(
  plaintext: Buffer | string,
  uaPublicKeyB64Url: string,
  authSecretB64Url: string,
  saltOverride?: Buffer,
): Buffer {
  const uaPublic = Buffer.from(uaPublicKeyB64Url, "base64url");
  const authSecret = Buffer.from(authSecretB64Url, "base64url");
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("Llave pública p256dh inválida");
  }
  if (authSecret.length !== 16) {
    throw new Error("Secreto auth Web Push inválido");
  }

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = saltOverride ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\x00", "utf8"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\x00", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\x00", "utf8"), 12));

  const plainBuf = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const padded = Buffer.concat([plainBuf, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const idLen = Buffer.from([asPublic.length]);
  return Buffer.concat([salt, rs, idLen, asPublic, ciphertext]);
}

export async function sendPushNotification(
  sub: Pick<StoredPushSubscription, "endpoint" | "p256dh" | "auth">,
  payload: WebPushMessagePayload,
  vapid: VapidConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; gone: boolean }> {
  const safeEndpoint = parseAllowedWebPushEndpoint(sub.endpoint);
  if (!safeEndpoint) {
    return { ok: false, status: 400, gone: false };
  }

  const body = encryptWebPushPayload(
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/app",
      tag: payload.tag ?? "pitchlab-alert",
      icon: payload.icon ?? "/brand/favicon-32x32.png",
      badge: payload.badge ?? "/brand/favicon-32x32.png",
    }),
    sub.p256dh,
    sub.auth,
  );
  const headers = buildVapidHeaders(safeEndpoint, vapid);
  const res = await fetchImpl(safeEndpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      ...headers,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(8_000),
  });
  return {
    ok: res.ok,
    status: res.status,
    gone: res.status === 404 || res.status === 410,
  };
}

export async function sendPushToUsers(
  db: Db,
  userIds: readonly string[],
  topic: PushTopic,
  payload: WebPushMessagePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; failed: number; pruned: number }> {
  const vapid = vapidConfigFromEnv();
  if (!vapid || userIds.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const subs = await listPushSubscriptionsForUsers(db, userIds, topic);
  if (subs.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const delivered: string[] = [];
  const gone: string[] = [];
  let failed = 0;

  for (const sub of subs) {
    try {
      const res = await sendPushNotification(sub, payload, vapid, fetchImpl);
      if (res.ok) delivered.push(sub.endpoint);
      else if (res.gone) gone.push(sub.endpoint);
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  await Promise.all([
    markPushSent(db, delivered).catch(() => undefined),
    deleteInvalidPushSubscriptions(db, gone).catch(() => undefined),
  ]);

  return { sent: delivered.length, failed, pruned: gone.length };
}
