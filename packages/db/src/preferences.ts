import { eq } from "drizzle-orm";
import type { Db } from "./billing";
import { withDbTransaction } from "./client";
import { userPreferences, users, type SavedScreenerViewRecord } from "./schema";

export type OddsFormatPref = "american" | "decimal";
export type ThemeModePref = "dark" | "light" | "system";
export type RiskPreference = "conservador" | "medio" | "arriesgado";
export type ResponsiblePauseKind = "24h" | "7d" | "30d";
export type AlertCadencePref = "inmediato" | "cada_15m" | "solo_hitos";

export type SavedScreenerViewPref = SavedScreenerViewRecord;

export type SavedScreenerViewPatchInput = Omit<SavedScreenerViewPref, "pinToHomeHub"> & {
  pinToHomeHub?: boolean;
};

export interface FollowedTopicsPref {
  leagues: string[];
  teams: string[];
  players?: string[];
  books?: string[];
  showInactiveLeagues?: boolean;
  lineMoveAlerts?: boolean;
  language?: string;
  alertCadence?: AlertCadencePref;
  savedViews?: SavedScreenerViewPref[];
}

export const MAX_PREFERRED_BOOKMAKERS = 12;
export const MAX_SAVED_SCREENER_VIEWS = 20;

const VALID_ALERT_CADENCE = new Set<AlertCadencePref>(["inmediato", "cada_15m", "solo_hitos"]);
const VALID_SCREENER_SPORTS = new Set(["all", "futbol", "nfl", "nba", "nhl", "mlb"]);
const VALID_SCREENER_BANDS = new Set(["all", "alta", "media", "baja"]);
const VALID_SCREENER_KINDS = new Set([
  "all",
  "resultado",
  "goles",
  "conteos",
  "ambos",
  "handicap",
]);
const VALID_SCREENER_SORTS = new Set(["p", "hora", "momio", "ventaja", "relevancia"]);
const VALID_SCREENER_WINDOWS = new Set(["all", "today", "next48h"]);
const BOOKMAKER_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function cleanSafeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  let filtered = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || ch === "<" || ch === ">") continue;
    filtered += ch;
  }
  return filtered.trim().slice(0, maxLen);
}

export function sanitizePreferredBookmakers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!BOOKMAKER_KEY_RE.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_PREFERRED_BOOKMAKERS) break;
  }
  return out;
}

export function sanitizeSavedViewsPref(raw: unknown): SavedScreenerViewPref[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedScreenerViewPref[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = cleanSafeText(obj.id, 48);
    const name = cleanSafeText(obj.name, 40);
    if (id.length < 2 || name.length < 2 || seen.has(id)) continue;
    seen.add(id);

    const rawSport = cleanSafeText(obj.sport, 24).toLowerCase();
    const sport = VALID_SCREENER_SPORTS.has(rawSport) ? rawSport : "all";
    const rawLeague = cleanSafeText(obj.league, 48);
    const league = rawLeague.length > 0 ? rawLeague : "all";
    const rawBand = cleanSafeText(obj.band, 24).toLowerCase();
    const band = VALID_SCREENER_BANDS.has(rawBand) ? rawBand : "all";
    const rawKind = cleanSafeText(obj.kind, 24).toLowerCase();
    const kind = VALID_SCREENER_KINDS.has(rawKind) ? rawKind : "all";
    const rawSort = cleanSafeText(obj.sort, 24).toLowerCase();
    const sort = VALID_SCREENER_SORTS.has(rawSort) ? rawSort : "p";
    const rawWindow = cleanSafeText(obj.window, 24);
    const windowVal = VALID_SCREENER_WINDOWS.has(rawWindow) ? rawWindow : "all";

    const rawMin =
      typeof obj.minOddsStep === "number" && Number.isFinite(obj.minOddsStep)
        ? Math.max(0, Math.min(99, Math.round(obj.minOddsStep)))
        : 0;
    const rawMax =
      typeof obj.maxOddsStep === "number" && Number.isFinite(obj.maxOddsStep)
        ? Math.max(1, Math.min(100, Math.round(obj.maxOddsStep)))
        : 100;
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
    if (out.length >= MAX_SAVED_SCREENER_VIEWS) break;
  }
  return out;
}

export function sanitizeFollowedTopics(raw: unknown): FollowedTopicsPref {
  const cleanList = (v: unknown, max = 60): string[] =>
    Array.isArray(v)
      ? Array.from(
          new Set(
            v
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim())
              .filter((x) => x.length > 0 && x.length <= 80),
          ),
        ).slice(0, max)
      : [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { leagues: [], teams: [] };
  }
  const obj = raw as Record<string, unknown>;
  const books = sanitizePreferredBookmakers(obj.books);
  const players = cleanList(obj.players, 60);
  const showInactiveLeagues =
    typeof obj.showInactiveLeagues === "boolean" ? obj.showInactiveLeagues : undefined;
  const lineMoveAlerts =
    typeof obj.lineMoveAlerts === "boolean" ? obj.lineMoveAlerts : undefined;
  const language =
    typeof obj.language === "string" && obj.language.trim().length >= 2
      ? obj.language.trim().slice(0, 16)
      : undefined;
  const alertCadence =
    typeof obj.alertCadence === "string" &&
    VALID_ALERT_CADENCE.has(obj.alertCadence as AlertCadencePref)
      ? (obj.alertCadence as AlertCadencePref)
      : undefined;
  const savedViews = sanitizeSavedViewsPref(obj.savedViews);
  return {
    leagues: cleanList(obj.leagues, 60),
    teams: cleanList(obj.teams, 80),
    ...(players.length > 0 ? { players } : {}),
    ...(books.length > 0 ? { books } : {}),
    ...(showInactiveLeagues !== undefined ? { showInactiveLeagues } : {}),
    ...(lineMoveAlerts !== undefined ? { lineMoveAlerts } : {}),
    ...(language ? { language } : {}),
    ...(alertCadence ? { alertCadence } : {}),
    ...(savedViews.length > 0 ? { savedViews } : {}),
  };
}

export interface UserPreferencesRecord {
  oddsFormat: OddsFormatPref;
  themeMode: ThemeModePref;
  timezone: string;
  riskPreference: RiskPreference;
  favoriteLeagues: string[];
  unitMxnCentavos: number;
  showMxnBalance: boolean;
  publicRecordVisible: boolean;
  emailPickResults: boolean;
  emailValueAlerts: boolean;
  emailBeforeMatch: boolean;
  emailBillingReminder: boolean;
  emailWeeklyDigest: boolean;
  emailMonthlyRecord: boolean;
  pushEnabled: boolean;
  showInRanking: boolean;
  pauseCommunity: boolean;
  responsiblePauseKind: ResponsiblePauseKind | null;
  responsiblePauseUntil: Date | null;
  recordPrivacy: Record<string, unknown>;
  bankrollStartMxnCentavos: number | null;
  followedTopics: FollowedTopicsPref;
  followedPlayers: string[];
  preferredBookmakers: string[];
  preferredBooks: string[];
  showInactiveLeagues: boolean;
  lineMoveAlerts: boolean;
  language: string;
  alertCadence: AlertCadencePref;
  savedViews: SavedScreenerViewPref[];
  featuredBadges: string[];
  updatedAt: Date | null;
}

export interface UserPreferencesPatch {
  oddsFormat?: OddsFormatPref;
  themeMode?: ThemeModePref;
  timezone?: string;
  riskPreference?: RiskPreference;
  favoriteLeagues?: string[];
  unitMxnCentavos?: number;
  showMxnBalance?: boolean;
  publicRecordVisible?: boolean;
  emailPickResults?: boolean;
  emailValueAlerts?: boolean;
  emailBeforeMatch?: boolean;
  emailBillingReminder?: boolean;
  emailWeeklyDigest?: boolean;
  emailMonthlyRecord?: boolean;
  pushEnabled?: boolean;
  showInRanking?: boolean;
  pauseCommunity?: boolean;
  responsiblePauseKind?: ResponsiblePauseKind | null;
  recordPrivacy?: Record<string, unknown>;
  bankrollStartMxnCentavos?: number | null;
  followedTopics?: FollowedTopicsPref;
  followedPlayers?: string[];
  preferredBookmakers?: string[];
  preferredBooks?: string[];
  showInactiveLeagues?: boolean;
  lineMoveAlerts?: boolean;
  language?: string;
  alertCadence?: AlertCadencePref;
  savedViews?: SavedScreenerViewPatchInput[];
  featuredBadges?: string[];
}

const PAUSE_DURATIONS_MS: Record<ResponsiblePauseKind, number> = {
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

const DEFAULT_LEAGUES = ["premier", "laliga", "champions", "ligamx", "nba", "nfl"];
const DEFAULT_BOOKS = ["codere", "bet365", "pinnacle"];

export function defaultUserPreferences(publicProfileFallback = true): UserPreferencesRecord {
  return {
    oddsFormat: "american",
    themeMode: "dark",
    timezone: "America/Mexico_City",
    riskPreference: "medio",
    favoriteLeagues: [...DEFAULT_LEAGUES],
    unitMxnCentavos: 25_000,
    showMxnBalance: false,
    publicRecordVisible: publicProfileFallback,
    emailPickResults: false,
    emailValueAlerts: true,
    emailBeforeMatch: false,
    emailBillingReminder: true,
    emailWeeklyDigest: false,
    emailMonthlyRecord: false,
    pushEnabled: false,
    showInRanking: publicProfileFallback,
    pauseCommunity: false,
    responsiblePauseKind: null,
    responsiblePauseUntil: null,
    recordPrivacy: {},
    bankrollStartMxnCentavos: null,
    followedTopics: {
      leagues: [],
      teams: [],
      players: [],
      books: [...DEFAULT_BOOKS],
      showInactiveLeagues: false,
      lineMoveAlerts: true,
      language: "es-MX",
      alertCadence: "inmediato",
      savedViews: [],
    },
    followedPlayers: [],
    preferredBookmakers: [],
    preferredBooks: [...DEFAULT_BOOKS],
    showInactiveLeagues: false,
    lineMoveAlerts: true,
    language: "es-MX",
    alertCadence: "inmediato",
    savedViews: [],
    featuredBadges: [],
    updatedAt: null,
  };
}

export async function getUserPreferences(db: Db, userId: string): Promise<UserPreferencesRecord> {
  const [[pref], [user]] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1),
    db.select({ publicProfile: users.publicProfile }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  return toUserPreferencesRecord(pref, user?.publicProfile ?? null);
}

export function toUserPreferencesRecord(
  pref: typeof userPreferences.$inferSelect | undefined,
  publicProfile: boolean | null,
): UserPreferencesRecord {
  const fallbackPublic = publicProfile ?? true;
  if (!pref) return defaultUserPreferences(fallbackPublic);

  const ft = sanitizeFollowedTopics((pref as { followedTopics?: unknown }).followedTopics);
  const colBookmakers = sanitizePreferredBookmakers(
    (pref as { preferredBookmakers?: unknown }).preferredBookmakers,
  );
  const preferredBookmakers = colBookmakers.length > 0 ? colBookmakers : (ft.books ?? []);
  const colSavedViews = sanitizeSavedViewsPref((pref as { savedViews?: unknown }).savedViews);
  const savedViews = colSavedViews.length > 0 ? colSavedViews : (ft.savedViews ?? []);

  return {
    oddsFormat: pref.oddsFormat === "decimal" ? "decimal" : "american",
    themeMode: pref.themeMode === "light" || pref.themeMode === "system" ? pref.themeMode : "dark",
    timezone: pref.timezone || "America/Mexico_City",
    riskPreference:
      pref.riskPreference === "conservador" || pref.riskPreference === "arriesgado"
        ? pref.riskPreference
        : "medio",
    favoriteLeagues: pref.favoriteLeagues.length > 0 ? pref.favoriteLeagues : [...DEFAULT_LEAGUES],
    unitMxnCentavos: pref.unitMxnCentavos,
    showMxnBalance: pref.showMxnBalance,
    publicRecordVisible: publicProfile === false ? false : pref.publicRecordVisible,
    emailPickResults: pref.emailPickResults,
    emailValueAlerts: pref.emailValueAlerts,
    emailBeforeMatch: pref.emailBeforeMatch,
    emailBillingReminder: pref.emailBillingReminder,
    emailWeeklyDigest: pref.emailWeeklyDigest,
    emailMonthlyRecord: pref.emailMonthlyRecord,
    pushEnabled: pref.pushEnabled,
    showInRanking: pref.showInRanking,
    pauseCommunity: pref.pauseCommunity,
    responsiblePauseKind:
      pref.responsiblePauseKind === "24h" ||
      pref.responsiblePauseKind === "7d" ||
      pref.responsiblePauseKind === "30d"
        ? pref.responsiblePauseKind
        : null,
    responsiblePauseUntil: pref.responsiblePauseUntil ?? null,
    recordPrivacy:
      pref.recordPrivacy && typeof pref.recordPrivacy === "object"
        ? (pref.recordPrivacy as Record<string, unknown>)
        : {},
    bankrollStartMxnCentavos: pref.bankrollStartMxnCentavos ?? null,
    followedTopics: ft,
    followedPlayers: ft.players ?? [],
    preferredBookmakers,
    preferredBooks: preferredBookmakers.length > 0 ? preferredBookmakers : [...DEFAULT_BOOKS],
    showInactiveLeagues: ft.showInactiveLeagues ?? false,
    lineMoveAlerts: ft.lineMoveAlerts ?? true,
    language: ft.language ?? "es-MX",
    alertCadence: ft.alertCadence ?? "inmediato",
    savedViews,
    featuredBadges: pref.featuredBadges ?? [],
    updatedAt: pref.updatedAt,
  };
}

export async function upsertUserPreferences(
  db: Db,
  userId: string,
  patch: UserPreferencesPatch,
  now = new Date(),
): Promise<UserPreferencesRecord> {
  return withDbTransaction(db, async (t) => {
    await t
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    const current = await getUserPreferences(t, userId);

    const oddsFormat: OddsFormatPref = patch.oddsFormat ?? current.oddsFormat;
    const themeMode: ThemeModePref = patch.themeMode ?? current.themeMode;
    const timezone = patch.timezone?.trim().slice(0, 64) || current.timezone;
    const riskPreference: RiskPreference = patch.riskPreference ?? current.riskPreference;
    const favoriteLeagues =
      patch.favoriteLeagues && patch.favoriteLeagues.length > 0
        ? Array.from(new Set(patch.favoriteLeagues.map((l) => l.trim()).filter(Boolean))).slice(0, 60)
        : current.favoriteLeagues;
    const unitMxnCentavos =
      patch.unitMxnCentavos !== undefined
        ? Math.min(10_000_000, Math.max(1_000, Math.round(patch.unitMxnCentavos)))
        : current.unitMxnCentavos;
    const showMxnBalance = patch.showMxnBalance ?? current.showMxnBalance;
    const publicRecordVisible = patch.publicRecordVisible ?? current.publicRecordVisible;
    const showInRanking = publicRecordVisible ? (patch.showInRanking ?? current.showInRanking) : false;
    const emailPickResults = patch.emailPickResults ?? current.emailPickResults;
    const emailValueAlerts = patch.emailValueAlerts ?? current.emailValueAlerts;
    const emailBeforeMatch = patch.emailBeforeMatch ?? current.emailBeforeMatch;
    const emailBillingReminder = patch.emailBillingReminder ?? current.emailBillingReminder;
    const emailWeeklyDigest = patch.emailWeeklyDigest ?? current.emailWeeklyDigest;
    const emailMonthlyRecord = patch.emailMonthlyRecord ?? current.emailMonthlyRecord;
    const pushEnabled = patch.pushEnabled ?? current.pushEnabled;
    const pauseCommunity = patch.pauseCommunity ?? current.pauseCommunity;
    const recordPrivacy = patch.recordPrivacy ?? current.recordPrivacy;
    const bankrollStartMxnCentavos =
      patch.bankrollStartMxnCentavos === undefined
        ? current.bankrollStartMxnCentavos
        : patch.bankrollStartMxnCentavos === null
          ? null
          : Math.min(1_000_000_000, Math.max(0, Math.round(patch.bankrollStartMxnCentavos)));
    const baseFollowedTopics =
      patch.followedTopics !== undefined
        ? sanitizeFollowedTopics(patch.followedTopics)
        : current.followedTopics;
    const nextBookmakers =
      patch.preferredBookmakers !== undefined
        ? sanitizePreferredBookmakers(patch.preferredBookmakers)
        : patch.preferredBooks !== undefined
          ? sanitizePreferredBookmakers(patch.preferredBooks)
          : patch.followedTopics?.books !== undefined
            ? sanitizePreferredBookmakers(baseFollowedTopics.books)
            : current.preferredBookmakers;
    const nextPlayers =
      patch.followedPlayers !== undefined
        ? Array.from(new Set(patch.followedPlayers.map((p) => p.trim()).filter(Boolean))).slice(0, 60)
        : baseFollowedTopics.players ?? current.followedPlayers;
    const nextShowInactive =
      patch.showInactiveLeagues !== undefined
        ? patch.showInactiveLeagues
        : baseFollowedTopics.showInactiveLeagues ?? current.showInactiveLeagues;
    const nextLineMoveAlerts =
      patch.lineMoveAlerts !== undefined
        ? patch.lineMoveAlerts
        : baseFollowedTopics.lineMoveAlerts ?? current.lineMoveAlerts;
    const nextLanguage =
      patch.language !== undefined && patch.language.trim().length >= 2
        ? patch.language.trim().slice(0, 16)
        : baseFollowedTopics.language ?? current.language;
    const nextAlertCadence: AlertCadencePref =
      patch.alertCadence !== undefined && VALID_ALERT_CADENCE.has(patch.alertCadence)
        ? patch.alertCadence
        : baseFollowedTopics.alertCadence ?? current.alertCadence;
    const nextSavedViews =
      patch.savedViews !== undefined
        ? sanitizeSavedViewsPref(patch.savedViews)
        : patch.followedTopics?.savedViews !== undefined
          ? sanitizeSavedViewsPref(baseFollowedTopics.savedViews)
          : current.savedViews;
    const followedTopics: FollowedTopicsPref = {
      leagues: baseFollowedTopics.leagues,
      teams: baseFollowedTopics.teams,
      ...(nextPlayers.length > 0 ? { players: nextPlayers } : {}),
      ...(nextBookmakers.length > 0 ? { books: nextBookmakers } : {}),
      showInactiveLeagues: nextShowInactive,
      lineMoveAlerts: nextLineMoveAlerts,
      language: nextLanguage,
      alertCadence: nextAlertCadence,
      ...(nextSavedViews.length > 0 ? { savedViews: nextSavedViews } : {}),
    };
    const featuredBadges =
      patch.featuredBadges !== undefined
        ? Array.from(new Set(patch.featuredBadges.map((b) => b.trim()).filter(Boolean))).slice(0, 3)
        : current.featuredBadges;

    let responsiblePauseKind = current.responsiblePauseKind;
    let responsiblePauseUntil = current.responsiblePauseUntil;
    if (patch.responsiblePauseKind !== undefined) {
      if (patch.responsiblePauseKind === null) {
        responsiblePauseKind = null;
        responsiblePauseUntil = null;
      } else {
        responsiblePauseKind = patch.responsiblePauseKind;
        responsiblePauseUntil = new Date(now.getTime() + PAUSE_DURATIONS_MS[patch.responsiblePauseKind]);
      }
    }

    await t
      .insert(userPreferences)
      .values({
        userId,
        oddsFormat,
        themeMode,
        timezone,
        riskPreference,
        favoriteLeagues,
        unitMxnCentavos,
        showMxnBalance,
        publicRecordVisible,
        emailPickResults,
        emailValueAlerts,
        emailBeforeMatch,
        emailBillingReminder,
        emailWeeklyDigest,
        emailMonthlyRecord,
        pushEnabled,
        showInRanking,
        pauseCommunity,
        responsiblePauseKind,
        responsiblePauseUntil,
        recordPrivacy,
        bankrollStartMxnCentavos,
        followedTopics,
        featuredBadges,
        preferredBookmakers: nextBookmakers,
        savedViews: nextSavedViews,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          oddsFormat,
          themeMode,
          timezone,
          riskPreference,
          favoriteLeagues,
          unitMxnCentavos,
          showMxnBalance,
          publicRecordVisible,
          emailPickResults,
          emailValueAlerts,
          emailBeforeMatch,
          emailBillingReminder,
          emailWeeklyDigest,
          emailMonthlyRecord,
          pushEnabled,
          showInRanking,
          pauseCommunity,
          responsiblePauseKind,
          responsiblePauseUntil,
          recordPrivacy,
          bankrollStartMxnCentavos,
          followedTopics,
          featuredBadges,
          preferredBookmakers: nextBookmakers,
          savedViews: nextSavedViews,
          updatedAt: now,
        },
      });

    if (patch.publicRecordVisible !== undefined) {
      await t.update(users).set({ publicProfile: publicRecordVisible }).where(eq(users.id, userId));
    }

    return getUserPreferences(t, userId);
  });
}
