/**
 * Paso 2 del registro en el servidor: valida lo que manda /onboarding y arma las huellas
 * anónimas del escudo de la prueba (nunca se guarda la IP ni el navegador en claro).
 */
import { createHash } from "node:crypto";

export interface SignupBody {
  email?: string;
  displayName: string;
  handle: string;
  birthDate: string;
  termsVersion: string;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  referralCode: string | null;
}

/** Valida el cuerpo de `POST /api/me/signup`; null si no tiene la forma esperada. */
export function parseSignupBody(raw: unknown): SignupBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const consents = b.consents as Record<string, unknown> | undefined;
  if (typeof b.displayName !== "string" || typeof b.handle !== "string") return null;
  if (typeof b.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.birthDate)) return null;
  if (!consents || consents.terms !== true || typeof consents.version !== "string") return null;
  const version = consents.version.trim().slice(0, 32);
  if (!version) return null;
  const code = typeof b.referralCode === "string" ? b.referralCode.trim().toUpperCase().slice(0, 24) : "";
  return {
    ...(typeof b.email === "string" ? { email: b.email.trim().toLowerCase() } : {}),
    displayName: b.displayName.slice(0, 80),
    handle: b.handle.slice(0, 40),
    birthDate: b.birthDate,
    termsVersion: version,
    analyticsConsent: consents.analytics === true,
    marketingConsent: consents.marketing === true,
    referralCode: code || null,
  };
}

/** Primera IP de `x-forwarded-for` (o `x-real-ip`). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "";
}

/** Subred de la IP: /24 en IPv4 y /48 en IPv6. */
export function ipSubnet(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 3).join(".") + ".0/24";
  if (ip.includes(":")) return ip.toLowerCase().split(":").slice(0, 3).join(":") + "::/48";
  return "desconocida";
}

const hmac = (salt: string, value: string): string =>
  createHash("sha256").update(`${salt}|${value}`).digest("hex");

/** Huellas con sal (BETTER_AUTH_SECRET) para el escudo de la prueba. */
export function trialHashes(headers: Headers, salt: string): { deviceFpHash: string; ipSubnetHash: string } {
  const device = `${headers.get("user-agent") ?? ""}|${headers.get("accept-language") ?? ""}`;
  return {
    deviceFpHash: hmac(salt, `device:${device}`),
    ipSubnetHash: hmac(salt, `subnet:${ipSubnet(clientIp(headers))}`),
  };
}
