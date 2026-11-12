import type { LeagueId } from "@pitchlab/contracts";
import { MEMBERSHIP_SPEC } from "../../spacetime-catalog";
import type { ViewerRole } from "../../types";

export const SHORT_INVITE_HOST = "pitchlab.mx";
export const REFERRAL_CODE_REGEX = /^[A-Z0-9-]{4,24}$/i;
export const PREFS_STORAGE_KEY = "pl-prefs-v1";

/** Valida y normaliza en mayúsculas un código de invitación; devuelve null si no es válido. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!REFERRAL_CODE_REGEX.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function isValidReferralCode(raw: string | null | undefined): boolean {
  return normalizeReferralCode(raw) !== null;
}

/** Enlace corto visible sin protocolo: pitchlab.mx/i/{CÓDIGO}. */
export function formatShortInviteDisplay(code: string): string {
  const normalized = normalizeReferralCode(code) ?? code.trim().toUpperCase();
  return `${SHORT_INVITE_HOST}/i/${normalized}`;
}

/** Enlace corto completo para compartir: https://pitchlab.mx/i/{CÓDIGO}. */
export function formatShortInviteUrl(code: string): string {
  return `https://${formatShortInviteDisplay(code)}`;
}

/** Mensaje para compartir en WhatsApp, X o portapapeles usando cifras de MEMBERSHIP_SPEC. */
export function buildInviteShareMessage(code: string): string {
  const url = formatShortInviteUrl(code);
  return `Te invito a PitchLab: ${MEMBERSHIP_SPEC.referralTrialDays} días sin costo y $${MEMBERSHIP_SPEC.referralFriendFirstMonthMxn} MXN en tu primer mes. Cuando pagas tu primer mes, los dos recibimos +${MEMBERSHIP_SPEC.referralBothRewardDays} días.\n${url}`;
}

export function buildWhatsAppShareHref(code: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildInviteShareMessage(code))}`;
}

export function buildXShareHref(code: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(buildInviteShareMessage(code))}`;
}

/**
 * Código de ejemplo determinístico derivado del @usuario cuando accountsEnabled es false.
 * Para @jair produce JAIR-2611.
 */
export function deriveExampleReferralCode(handle: string): string {
  const clean = handle
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const prefix = clean.length >= 2 ? clean : "SOCIO";
  let hash = 0;
  for (let i = 0; i < prefix.length; i += 1) {
    hash = (hash * 31 + prefix.charCodeAt(i)) % 9000;
  }
  const digits = ((hash + 267) % 9000) + 1000;
  return `${prefix}-${digits}`;
}

export interface SessionAccountIdentity {
  cleanHandle: string;
  atHandle: string;
  initials: string;
  displayName: string;
  isTipstar: boolean;
  avatarGrad: string;
}

export interface ServerProfileSummary {
  handle?: string | null;
  displayName?: string | null;
  email?: string | null;
  isTipstar?: boolean;
}

function computeInitials(displayName: string | null | undefined, cleanHandle: string): string {
  const trimmed = (displayName ?? "").trim();
  if (trimmed.length > 0) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return cleanHandle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "PL";
}

/** Resuelve @usuario e iniciales desde la sesión real o desde el rol activo de la beta. */
export function resolveSessionIdentity(
  viewerRole: ViewerRole,
  serverProfile?: ServerProfileSummary | null,
): SessionAccountIdentity {
  if (serverProfile && (serverProfile.handle || serverProfile.email || serverProfile.displayName)) {
    const rawHandle =
      serverProfile.handle?.trim() ||
      serverProfile.email?.split("@")[0]?.trim() ||
      "socio";
    const cleanHandle =
      rawHandle.replace(/^@/, "").replace(/[^a-zA-Z0-9_.-]/g, "").toLowerCase() || "socio";
    const isTipstar = Boolean(serverProfile.isTipstar || viewerRole === "tipstar");
    const displayName = serverProfile.displayName?.trim() || `@${cleanHandle}`;
    return {
      cleanHandle,
      atHandle: `@${cleanHandle}`,
      initials: computeInitials(serverProfile.displayName, cleanHandle),
      displayName,
      isTipstar,
      avatarGrad: isTipstar ? "var(--avatar-grad-1)" : "var(--avatar-grad-2)",
    };
  }

  if (viewerRole === "tipstar") {
    return {
      cleanHandle: "sofia_nfl",
      atHandle: "@sofia_nfl",
      initials: "SM",
      displayName: "Sofía Méndez",
      isTipstar: true,
      avatarGrad: "var(--avatar-grad-1)",
    };
  }

  return {
    cleanHandle: "jair",
    atHandle: "@jair",
    initials: "JR",
    displayName: "Jair",
    isTipstar: false,
    avatarGrad: "var(--avatar-grad-2)",
  };
}

/** Valida que quede al menos una liga activa al alternar una liga en Preferencias. */
export function toggleLeagueSelection(
  current: readonly LeagueId[],
  target: LeagueId,
): { next: LeagueId[]; blockedLast: boolean } {
  const exists = current.includes(target);
  if (exists) {
    if (current.length <= 1) {
      return { next: [...current], blockedLast: true };
    }
    return { next: current.filter((id) => id !== target), blockedLast: false };
  }
  return { next: [...current, target], blockedLast: false };
}

export type ThemePreference = "dark" | "light" | "system";
export type PauseChoice = "24h" | "7d" | "30d" | null;

export interface StoredAccountPrefsV1 {
  v: 1;
  themeMode: ThemePreference;
  timezone: string;
  showMxnBalance: boolean;
  unitMxn: number;
  alerts: {
    valueAlerts: boolean;
    beforeMatch: boolean;
    pickSettled: boolean;
    billingReminder: boolean;
  };
  privacy: {
    publicProfile: boolean;
    showInRanking: boolean;
    pauseCommunity: boolean;
  };
  pauseChoice: PauseChoice;
  pauseChosenAtIso: string | null;
}

export const DEFAULT_STORED_PREFS_V1: StoredAccountPrefsV1 = {
  v: 1,
  themeMode: "dark",
  timezone: "America/Mexico_City",
  showMxnBalance: false,
  unitMxn: 250,
  alerts: {
    valueAlerts: true,
    beforeMatch: true,
    pickSettled: true,
    billingReminder: true,
  },
  privacy: {
    publicProfile: true,
    showInRanking: true,
    pauseCommunity: false,
  },
  pauseChoice: null,
  pauseChosenAtIso: null,
};

export function readStoredPrefs(): StoredAccountPrefsV1 {
  if (typeof window === "undefined") return DEFAULT_STORED_PREFS_V1;
  try {
    const rawTheme = window.localStorage.getItem("pl-theme");
    const domTheme =
      typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark";
    const fallbackTheme: ThemePreference =
      rawTheme === "light" ? "light" : rawTheme === "dark" ? "dark" : domTheme;
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_STORED_PREFS_V1, themeMode: fallbackTheme };
    }
    const parsed = JSON.parse(raw) as Partial<StoredAccountPrefsV1> | null;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_STORED_PREFS_V1, themeMode: fallbackTheme };
    }
    const themeMode: ThemePreference =
      parsed.themeMode === "light" || parsed.themeMode === "dark" || parsed.themeMode === "system"
        ? parsed.themeMode
        : fallbackTheme;
    const timezone =
      typeof parsed.timezone === "string" && parsed.timezone.trim().length > 0
        ? parsed.timezone
        : DEFAULT_STORED_PREFS_V1.timezone;
    const unitMxn =
      typeof parsed.unitMxn === "number" && Number.isFinite(parsed.unitMxn) && parsed.unitMxn >= 10
        ? Math.min(100_000, Math.round(parsed.unitMxn))
        : DEFAULT_STORED_PREFS_V1.unitMxn;
    const pauseChoice: PauseChoice =
      parsed.pauseChoice === "24h" || parsed.pauseChoice === "7d" || parsed.pauseChoice === "30d"
        ? parsed.pauseChoice
        : null;

    return {
      v: 1,
      themeMode,
      timezone,
      showMxnBalance: Boolean(parsed.showMxnBalance),
      unitMxn,
      alerts: {
        valueAlerts: parsed.alerts?.valueAlerts ?? DEFAULT_STORED_PREFS_V1.alerts.valueAlerts,
        beforeMatch: parsed.alerts?.beforeMatch ?? DEFAULT_STORED_PREFS_V1.alerts.beforeMatch,
        pickSettled: parsed.alerts?.pickSettled ?? DEFAULT_STORED_PREFS_V1.alerts.pickSettled,
        billingReminder:
          parsed.alerts?.billingReminder ?? DEFAULT_STORED_PREFS_V1.alerts.billingReminder,
      },
      privacy: {
        publicProfile:
          parsed.privacy?.publicProfile ?? DEFAULT_STORED_PREFS_V1.privacy.publicProfile,
        showInRanking:
          parsed.privacy?.showInRanking ?? DEFAULT_STORED_PREFS_V1.privacy.showInRanking,
        pauseCommunity:
          parsed.privacy?.pauseCommunity ?? DEFAULT_STORED_PREFS_V1.privacy.pauseCommunity,
      },
      pauseChoice,
      pauseChosenAtIso:
        typeof parsed.pauseChosenAtIso === "string" ? parsed.pauseChosenAtIso : null,
    };
  } catch (err) {
    void err;
    return DEFAULT_STORED_PREFS_V1;
  }
}

export function writeStoredPrefs(next: StoredAccountPrefsV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    void err;
  }
}
