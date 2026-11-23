import { createHash } from "node:crypto";
import { SIGNUP_CONSENT_VERSION } from "@pitchlab/db";
import { trustedClientIp } from "./request-security";

export interface SignupBody {
  email?: string;
  displayName: string;
  handle: string;
  birthDate: string;
  termsVersion: string;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  referralCode: string | null;
  turnstileToken?: string | null;
}

export function parseSignupBody(raw: unknown): SignupBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const consents = b.consents as Record<string, unknown> | undefined;
  if (typeof b.displayName !== "string" || typeof b.handle !== "string") return null;
  if (typeof b.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.birthDate)) return null;
  if (!consents || consents.terms !== true || typeof consents.version !== "string") return null;
  const version = consents.version.trim().slice(0, 32);
  if (version !== SIGNUP_CONSENT_VERSION) return null;
  const code = typeof b.referralCode === "string" ? b.referralCode.trim().toUpperCase().slice(0, 24) : "";
  const turnstileToken =
    typeof b.turnstileToken === "string" && b.turnstileToken.trim() ? b.turnstileToken.trim().slice(0, 4096) : null;
  return {
    ...(typeof b.email === "string" ? { email: b.email.trim().toLowerCase() } : {}),
    displayName: b.displayName.slice(0, 80),
    handle: b.handle.slice(0, 40),
    birthDate: b.birthDate,
    termsVersion: version,
    analyticsConsent: consents.analytics === true,
    marketingConsent: consents.marketing === true,
    referralCode: code || null,
    ...(turnstileToken ? { turnstileToken } : {}),
  };
}

export function clientIp(headers: Headers): string {
  return trustedClientIp(headers);
}

export function ipSubnet(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 3).join(".") + ".0/24";
  if (ip.includes(":")) return ip.toLowerCase().split(":").slice(0, 3).join(":") + "::/48";
  return "desconocida";
}

const hmac = (salt: string, value: string): string =>
  createHash("sha256").update(`${salt}|${value}`).digest("hex");

export function trialHashes(
  headers: Headers,
  salt: string,
): {
  deviceFpHash: string;
  ipSubnetHash: string;
  unknownDevice: boolean;
  unknownSubnet: boolean;
} {
  const ua = headers.get("user-agent")?.trim() ?? "";
  const lang = headers.get("accept-language")?.trim() ?? "";
  const device = `${ua}|${lang}`;
  const subnet = ipSubnet(clientIp(headers));
  return {
    deviceFpHash: hmac(salt, `device:${device}`),
    ipSubnetHash: hmac(salt, `subnet:${subnet}`),
    unknownDevice: ua.length === 0,
    unknownSubnet: subnet === "desconocida",
  };
}
