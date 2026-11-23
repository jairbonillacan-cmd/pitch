import { parseStrictFiniteNumber, type LeagueId } from "@pitchlab/contracts";
import {
  DEFAULT_PREFERRED_BOOKS,
  formatCanonicalBookLabel,
  normalizeBookKey,
  sanitizePreferredBooks,
  type BookmakerOption,
} from "../../bookmakers";
import {
  DEFAULT_RECORD_PRIVACY,
  normalizeRecordPrivacy,
  type RecordPrivacy,
} from "../../record-stats";
import { MEMBERSHIP_SPEC } from "../../spacetime-catalog";
import type { OddsFormat, ViewerRole } from "../../types";

export const SHORT_INVITE_HOST = "pitchlab.mx";
export const REFERRAL_CODE_REGEX = /^[A-Z0-9-]{4,24}$/i;
export const PREFS_STORAGE_KEY = "pl-prefs-v1";
export const CFDI_STORAGE_KEY = "pl-cfdi-v1";
export const MAX_PREFERRED_BOOKMAKERS_PREF = 12;
export const MAX_SAVED_VIEWS_PREF = 20;
export const ACCOUNT_SAVED_VIEWS_STORAGE_KEY = "pl-screener-views-v1";

export type AccountSavedViewSport = "all" | "futbol" | "nfl" | "nba" | "nhl" | "mlb";
export type AccountSavedViewBand = "all" | "alta" | "media" | "baja";
export type AccountSavedViewKind =
  | "all"
  | "resultado"
  | "goles"
  | "conteos"
  | "ambos"
  | "handicap";
export type AccountSavedViewSort = "p" | "hora" | "momio" | "ventaja" | "relevancia";
export type AccountSavedViewWindow = "all" | "today" | "next48h";

export interface AccountSavedView {
  readonly id: string;
  readonly name: string;
  readonly sport: AccountSavedViewSport;
  readonly league: string;
  readonly band: AccountSavedViewBand;
  readonly kind: AccountSavedViewKind;
  readonly sort: AccountSavedViewSort;
  readonly onlyPositiveEdge: boolean;
  readonly minOddsStep: number;
  readonly maxOddsStep: number;
  readonly window: AccountSavedViewWindow;
  readonly pinToHomeHub: boolean;
}

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!REFERRAL_CODE_REGEX.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function isValidReferralCode(raw: string | null | undefined): boolean {
  return normalizeReferralCode(raw) !== null;
}

export function formatShortInviteDisplay(code: string): string {
  const normalized = normalizeReferralCode(code) ?? code.trim().toUpperCase();
  return `${SHORT_INVITE_HOST}/i/${normalized}`;
}

export function formatShortInviteUrl(code: string): string {
  return `https://${formatShortInviteDisplay(code)}`;
}

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
  isTipster: boolean;
  avatarGrad: string;
  avatarUrl?: string | null;
}

export interface ServerProfileSummary {
  handle?: string | null;
  displayName?: string | null;
  email?: string | null;
  isTipster?: boolean;
  avatarUrl?: string | null;
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
    const isTipster = Boolean(serverProfile.isTipster || viewerRole === "tipster");
    const displayName = serverProfile.displayName?.trim() || `@${cleanHandle}`;
    return {
      cleanHandle,
      atHandle: `@${cleanHandle}`,
      initials: computeInitials(serverProfile.displayName, cleanHandle),
      displayName,
      isTipster,
      avatarGrad: isTipster ? "var(--avatar-grad-1)" : "var(--avatar-grad-2)",
      avatarUrl: serverProfile.avatarUrl ?? null,
    };
  }

  if (viewerRole === "tipster") {
    return {
      cleanHandle: "sofia_nfl",
      atHandle: "@sofia_nfl",
      initials: "SM",
      displayName: "Sofía Méndez",
      isTipster: true,
      avatarGrad: "var(--avatar-grad-1)",
    };
  }

  return {
    cleanHandle: "jair",
    atHandle: "@jair",
    initials: "JR",
    displayName: "Jair",
    isTipster: false,
    avatarGrad: "var(--avatar-grad-2)",
  };
}

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
export type AlertCadence = "inmediato" | "cada_15m" | "solo_hitos";

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
    weeklyDigest: boolean;
    monthlyRecord: boolean;
  };
  alertCadence: AlertCadence;
  privacy: {
    publicProfile: boolean;
    showInRanking: boolean;
    pauseCommunity: boolean;
  };
  pauseChoice: PauseChoice;
  pauseChosenAtIso: string | null;
  recordPrivacy: RecordPrivacy;
  bankrollStartMxn: number | null;
  preferredBooks: string[];
  savedViews?: AccountSavedView[];
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
    pickSettled: false,
    billingReminder: true,
    weeklyDigest: false,
    monthlyRecord: false,
  },
  alertCadence: "inmediato",
  privacy: {
    publicProfile: true,
    showInRanking: true,
    pauseCommunity: false,
  },
  pauseChoice: null,
  pauseChosenAtIso: null,
  recordPrivacy: structuredClone(DEFAULT_RECORD_PRIVACY),
  bankrollStartMxn: null,
  preferredBooks: [...DEFAULT_PREFERRED_BOOKS],
  savedViews: [],
};

function isValidIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(0));
    return true;
  } catch (err) {
    void err;
    return false;
  }
}

export function sanitizePreferredBookmakersPref(raw: unknown): string[] {
  return sanitizePreferredBooks(raw).slice(0, MAX_PREFERRED_BOOKMAKERS_PREF);
}

const VALID_SAVED_SPORTS = new Set<AccountSavedViewSport>([
  "all",
  "futbol",
  "nfl",
  "nba",
  "nhl",
  "mlb",
]);
const VALID_SAVED_BANDS = new Set<AccountSavedViewBand>(["all", "alta", "media", "baja"]);
const VALID_SAVED_KINDS = new Set<AccountSavedViewKind>([
  "all",
  "resultado",
  "goles",
  "conteos",
  "ambos",
  "handicap",
]);
const VALID_SAVED_SORTS = new Set<AccountSavedViewSort>([
  "p",
  "hora",
  "momio",
  "ventaja",
  "relevancia",
]);
const VALID_SAVED_WINDOWS = new Set<AccountSavedViewWindow>(["all", "today", "next48h"]);

function stripControlText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || ch === "<" || ch === ">") continue;
    out += ch;
  }
  return out.trim().slice(0, maxLen);
}

export function sanitizeAccountSavedViews(raw: unknown): AccountSavedView[] {
  if (!Array.isArray(raw)) return [];
  const out: AccountSavedView[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = stripControlText(obj.id, 48);
    const name = stripControlText(obj.name, 40);
    if (id.length < 2 || name.length < 2 || seenIds.has(id)) continue;
    seenIds.add(id);

    const rawSport = stripControlText(obj.sport, 24).toLowerCase() as AccountSavedViewSport;
    const sport: AccountSavedViewSport = VALID_SAVED_SPORTS.has(rawSport) ? rawSport : "all";
    const rawLeague = stripControlText(obj.league, 48);
    const league = rawLeague.length > 0 ? rawLeague : "all";
    const rawBand = stripControlText(obj.band, 24).toLowerCase() as AccountSavedViewBand;
    const band: AccountSavedViewBand = VALID_SAVED_BANDS.has(rawBand) ? rawBand : "all";
    const rawKind = stripControlText(obj.kind, 24).toLowerCase() as AccountSavedViewKind;
    const kind: AccountSavedViewKind = VALID_SAVED_KINDS.has(rawKind) ? rawKind : "all";
    const rawSort = stripControlText(obj.sort, 24).toLowerCase() as AccountSavedViewSort;
    const sort: AccountSavedViewSort = VALID_SAVED_SORTS.has(rawSort) ? rawSort : "p";
    const rawWindow = stripControlText(obj.window, 24) as AccountSavedViewWindow;
    const windowVal: AccountSavedViewWindow = VALID_SAVED_WINDOWS.has(rawWindow)
      ? rawWindow
      : "all";

    const parsedMin = parseStrictFiniteNumber(obj.minOddsStep);
    const parsedMax = parseStrictFiniteNumber(obj.maxOddsStep);
    const rawMin = parsedMin !== null ? Math.max(0, Math.min(99, Math.round(parsedMin))) : 0;
    const rawMax = parsedMax !== null ? Math.max(1, Math.min(100, Math.round(parsedMax))) : 100;
    const minOddsStep = Math.min(rawMin, rawMax - 1);
    const maxOddsStep = Math.max(rawMax, minOddsStep + 1);

    out.push({
      id,
      name,
      sport,
      league,
      band,
      kind,
      sort,
      onlyPositiveEdge: Boolean(obj.onlyPositiveEdge),
      minOddsStep,
      maxOddsStep,
      window: windowVal,
      pinToHomeHub: Boolean(obj.pinToHomeHub),
    });

    if (out.length >= MAX_SAVED_VIEWS_PREF) break;
  }

  return out;
}

export function serializeSavedViewsForApi(
  views: readonly AccountSavedView[],
): AccountSavedView[] {
  return sanitizeAccountSavedViews(views).map((v) => ({
    id: v.id,
    name: v.name,
    sport: v.sport,
    league: v.league,
    band: v.band,
    kind: v.kind,
    sort: v.sort,
    onlyPositiveEdge: v.onlyPositiveEdge,
    minOddsStep: v.minOddsStep,
    maxOddsStep: v.maxOddsStep,
    window: v.window,
    pinToHomeHub: v.pinToHomeHub,
  }));
}

export function readAccountSavedViews(): AccountSavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const prefsViews = sanitizeAccountSavedViews(readStoredPrefs().savedViews);
    const rawScreener = window.localStorage.getItem(ACCOUNT_SAVED_VIEWS_STORAGE_KEY);
    const screenerViews = rawScreener
      ? sanitizeAccountSavedViews(JSON.parse(rawScreener))
      : [];
    const byId = new Map<string, AccountSavedView>();
    for (const item of screenerViews) {
      byId.set(item.id, item);
    }
    for (const item of prefsViews) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values()).slice(0, MAX_SAVED_VIEWS_PREF);
  } catch (err) {
    void err;
    return [];
  }
}

export function writeAccountSavedViews(views: readonly AccountSavedView[]): void {
  if (typeof window === "undefined") return;
  const clean = serializeSavedViewsForApi(views);
  try {
    window.localStorage.setItem(ACCOUNT_SAVED_VIEWS_STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    void err;
  }
  const currentPrefs = readStoredPrefs();
  writeStoredPrefs({ ...currentPrefs, savedViews: clean });
}

const SPORT_LABELS_ES: Readonly<Record<AccountSavedViewSport, string>> = {
  all: "Todos los deportes",
  futbol: "Fútbol",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
};

const BAND_LABELS_ES: Readonly<Record<AccountSavedViewBand, string>> = {
  all: "",
  alta: "Prob. alta",
  media: "Prob. media",
  baja: "Cuota alta",
};

const WINDOW_LABELS_ES: Readonly<Record<AccountSavedViewWindow, string>> = {
  all: "",
  today: "Hoy",
  next48h: "Próximas 48 h",
};

export function describeSavedViewFilters(view: AccountSavedView): string {
  const parts: string[] = [SPORT_LABELS_ES[view.sport] ?? "Todos los deportes"];
  if (view.league !== "all") {
    parts.push(view.league);
  }
  const bandLabel = BAND_LABELS_ES[view.band];
  if (bandLabel) parts.push(bandLabel);
  if (view.onlyPositiveEdge) parts.push("Solo EV+");
  const windowLabel = WINDOW_LABELS_ES[view.window];
  if (windowLabel) parts.push(windowLabel);
  return parts.join(" · ");
}

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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_STORED_PREFS_V1, themeMode: fallbackTheme };
    }
    const themeMode: ThemePreference =
      parsed.themeMode === "light" || parsed.themeMode === "dark" || parsed.themeMode === "system"
        ? parsed.themeMode
        : fallbackTheme;
    const rawTz = typeof parsed.timezone === "string" ? parsed.timezone.trim() : "";
    const timezone =
      rawTz.length > 0 && isValidIanaTimeZone(rawTz)
        ? rawTz
        : DEFAULT_STORED_PREFS_V1.timezone;
    const unitMxn =
      typeof parsed.unitMxn === "number" && Number.isFinite(parsed.unitMxn) && parsed.unitMxn >= 10
        ? Math.min(100_000, Math.round(parsed.unitMxn))
        : DEFAULT_STORED_PREFS_V1.unitMxn;
    const pauseChoice: PauseChoice =
      parsed.pauseChoice === "24h" || parsed.pauseChoice === "7d" || parsed.pauseChoice === "30d"
        ? parsed.pauseChoice
        : null;
    const rawAlerts =
      parsed.alerts && typeof parsed.alerts === "object" && !Array.isArray(parsed.alerts)
        ? parsed.alerts
        : null;
    const rawPrivacy =
      parsed.privacy && typeof parsed.privacy === "object" && !Array.isArray(parsed.privacy)
        ? parsed.privacy
        : null;

    return {
      v: 1,
      themeMode,
      timezone,
      showMxnBalance: Boolean(parsed.showMxnBalance),
      unitMxn,
      alerts: {
        valueAlerts:
          typeof rawAlerts?.valueAlerts === "boolean"
            ? rawAlerts.valueAlerts
            : DEFAULT_STORED_PREFS_V1.alerts.valueAlerts,
        beforeMatch:
          typeof rawAlerts?.beforeMatch === "boolean"
            ? rawAlerts.beforeMatch
            : DEFAULT_STORED_PREFS_V1.alerts.beforeMatch,
        pickSettled:
          typeof rawAlerts?.pickSettled === "boolean"
            ? rawAlerts.pickSettled
            : DEFAULT_STORED_PREFS_V1.alerts.pickSettled,
        billingReminder:
          typeof rawAlerts?.billingReminder === "boolean"
            ? rawAlerts.billingReminder
            : DEFAULT_STORED_PREFS_V1.alerts.billingReminder,
        weeklyDigest:
          typeof rawAlerts?.weeklyDigest === "boolean"
            ? rawAlerts.weeklyDigest
            : DEFAULT_STORED_PREFS_V1.alerts.weeklyDigest,
        monthlyRecord:
          typeof rawAlerts?.monthlyRecord === "boolean"
            ? rawAlerts.monthlyRecord
            : DEFAULT_STORED_PREFS_V1.alerts.monthlyRecord,
      },
      alertCadence:
        parsed.alertCadence === "cada_15m" || parsed.alertCadence === "solo_hitos"
          ? parsed.alertCadence
          : "inmediato",
      privacy: {
        publicProfile:
          typeof rawPrivacy?.publicProfile === "boolean"
            ? rawPrivacy.publicProfile
            : DEFAULT_STORED_PREFS_V1.privacy.publicProfile,
        showInRanking:
          typeof rawPrivacy?.showInRanking === "boolean"
            ? rawPrivacy.showInRanking
            : DEFAULT_STORED_PREFS_V1.privacy.showInRanking,
        pauseCommunity:
          typeof rawPrivacy?.pauseCommunity === "boolean"
            ? rawPrivacy.pauseCommunity
            : DEFAULT_STORED_PREFS_V1.privacy.pauseCommunity,
      },
      pauseChoice,
      pauseChosenAtIso:
        typeof parsed.pauseChosenAtIso === "string" ? parsed.pauseChosenAtIso : null,
      recordPrivacy: normalizeRecordPrivacy(parsed.recordPrivacy),
      bankrollStartMxn:
        typeof parsed.bankrollStartMxn === "number" &&
        Number.isFinite(parsed.bankrollStartMxn) &&
        parsed.bankrollStartMxn >= 0 &&
        parsed.bankrollStartMxn <= 10_000_000
          ? Math.round(parsed.bankrollStartMxn)
          : null,
      preferredBooks:
        parsed.preferredBooks !== undefined
          ? sanitizePreferredBookmakersPref(parsed.preferredBooks)
          : [...DEFAULT_PREFERRED_BOOKS],
      savedViews: sanitizeAccountSavedViews(parsed.savedViews),
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

export interface StoredCfdiDraftV1 {
  v: 1;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  usoCfdi: string;
  cpFiscal: string;
}

export const DEFAULT_CFDI_DRAFT_V1: StoredCfdiDraftV1 = {
  v: 1,
  rfc: "",
  razonSocial: "",
  regimenFiscal: "612",
  usoCfdi: "G03",
  cpFiscal: "",
};

export function readStoredCfdiDraft(): StoredCfdiDraftV1 {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(CFDI_STORAGE_KEY);
    } catch (err) {
      void err;
    }
  }
  return { ...DEFAULT_CFDI_DRAFT_V1 };
}

export function writeStoredCfdiDraft(_next: StoredCfdiDraftV1): void {
  void _next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(CFDI_STORAGE_KEY);
    } catch (err) {
      void err;
    }
  }
}

const RFC_PERSONA_MORAL_REGEX =
  /^[A-ZÑ&]{3}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;
const RFC_PERSONA_FISICA_REGEX =
  /^[A-ZÑ&]{4}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;

function hasValidRfcCalendarDate(match: RegExpExecArray | null): boolean {
  if (!match) return false;
  const yearPart = parseStrictFiniteNumber(match[1]);
  const month = parseStrictFiniteNumber(match[2]);
  const day = parseStrictFiniteNumber(match[3]);
  if (yearPart === null || month === null || day === null) return false;
  const fullYear = 2000 + yearPart;
  const dt = new Date(Date.UTC(fullYear, month - 1, day));
  return (
    dt.getUTCFullYear() === fullYear &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function validateMexicanRfc(
  rawRfc: string,
  regimenFiscal?: string,
): { valid: boolean; error?: string } {
  const cleaned = rawRfc.trim().toUpperCase();
  if (!cleaned) {
    return { valid: false, error: "Ingresa tu RFC de 12 o 13 caracteres." };
  }
  if (regimenFiscal === "601") {
    if (!hasValidRfcCalendarDate(RFC_PERSONA_MORAL_REGEX.exec(cleaned))) {
      return {
        valid: false,
        error: "Para régimen 601 (Persona Moral), el RFC debe tener 12 caracteres válidos ante el SAT.",
      };
    }
    return { valid: true };
  }
  if (regimenFiscal && regimenFiscal !== "601") {
    if (!hasValidRfcCalendarDate(RFC_PERSONA_FISICA_REGEX.exec(cleaned))) {
      return {
        valid: false,
        error: "Para persona física, el RFC debe tener 13 caracteres válidos ante el SAT.",
      };
    }
    return { valid: true };
  }
  if (
    !hasValidRfcCalendarDate(RFC_PERSONA_FISICA_REGEX.exec(cleaned)) &&
    !hasValidRfcCalendarDate(RFC_PERSONA_MORAL_REGEX.exec(cleaned))
  ) {
    return {
      valid: false,
      error: "Revisa el RFC: debe cumplir el formato del SAT de 12 o 13 caracteres.",
    };
  }
  return { valid: true };
}

export function formatKickoffByTimezone(
  kickoffUtc: string | null | undefined,
  fallbackLocal: string,
  timeZone?: string | null,
): string {
  if (!kickoffUtc || !timeZone) return fallbackLocal;
  try {
    const trimmed = kickoffUtc.trim();
    if (!trimmed) return fallbackLocal;
    const hasExplicitTz = /([Zz]|[+-]\d{2}:\d{2})$/.test(trimmed);
    const normalized =
      trimmed.length === 10
        ? `${trimmed}T15:00:00Z`
        : hasExplicitTz
          ? trimmed
          : `${trimmed}-06:00`;
    const ms = Date.parse(normalized);
    if (!Number.isFinite(ms)) return fallbackLocal;
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(new Date(ms));
  } catch (err) {
    void err;
    return fallbackLocal;
  }
}

export function sanitizeCsvCell(raw: string): string {
  const escaped = raw.replace(/"/g, '""');
  return /^[=+\-@\t\r]/.test(escaped.trimStart()) ? `'${escaped}` : escaped;
}

export function formatUnitsAsMxn(units: number, unitMxn: number): string {
  const safeUnit = Number.isFinite(unitMxn) && unitMxn > 0 ? unitMxn : 250;
  const safeUnits = Number.isFinite(units) ? units : 0;
  const amount = Math.round(Math.abs(safeUnits) * safeUnit);
  const sign = safeUnits < 0 ? "−" : safeUnits > 0 ? "+" : "";
  return `${sign}$${amount.toLocaleString("es-MX")} MXN`;
}

export const PRIORITY_MX_BOOKMAKER_IDS = [
  "pinnacle",
  "bet365",
  "codere",
  "betcris",
  "caliente_mx",
] as const;

export type PriorityMxBookmakerId = (typeof PRIORITY_MX_BOOKMAKER_IDS)[number];

const PRIORITY_MX_RANK: ReadonlyMap<string, number> = new Map(
  PRIORITY_MX_BOOKMAKER_IDS.map((id, idx) => [id, idx]),
);

export function isPriorityMxBookmaker(bookId: string): boolean {
  return PRIORITY_MX_RANK.has(normalizeBookKey(bookId));
}

export interface PartitionedBookmakers {
  readonly priorityMx: readonly BookmakerOption[];
  readonly others: readonly BookmakerOption[];
}

export function partitionPriorityBookmakers(
  options: readonly BookmakerOption[],
): PartitionedBookmakers {
  const priorityMx: BookmakerOption[] = [];
  const others: BookmakerOption[] = [];
  for (const option of options) {
    if (PRIORITY_MX_RANK.has(normalizeBookKey(option.id))) {
      priorityMx.push(option);
    } else {
      others.push(option);
    }
  }
  priorityMx.sort(
    (a, b) =>
      (PRIORITY_MX_RANK.get(normalizeBookKey(a.id)) ?? 99) -
      (PRIORITY_MX_RANK.get(normalizeBookKey(b.id)) ?? 99),
  );
  return { priorityMx, others };
}

export function formatPreferredBooksSummary(bookIds: readonly string[]): string {
  if (bookIds.length === 0) return "Sin casas";
  const ordered = [...bookIds].sort((a, b) => {
    const rankA = PRIORITY_MX_RANK.get(normalizeBookKey(a)) ?? 99;
    const rankB = PRIORITY_MX_RANK.get(normalizeBookKey(b)) ?? 99;
    return rankA - rankB;
  });
  const firstTwo = ordered.slice(0, 2).map((id) => formatCanonicalBookLabel(id));
  const extra = ordered.length - firstTwo.length;
  return extra > 0 ? `${firstTwo.join(", ")} +${extra}` : firstTwo.join(", ");
}

export function getOddsFormatPreview(format: OddsFormat): {
  readonly label: string;
  readonly shortExample: string;
  readonly detail: string;
  readonly sampleFair: string;
} {
  if (format === "decimal") {
    return {
      label: "Decimal",
      shortExample: "1.77 · 2.31",
      detail: "Así: 1.77 · 2.31 (formato europeo, incluye tu unidad).",
      sampleFair: "56.0 % → 1.79",
    };
  }
  return {
    label: "Americano",
    shortExample: "−130 · +131",
    detail: "Así: −130 · +131. Estándar en casas de México.",
    sampleFair: "56.0 % → −127",
  };
}
