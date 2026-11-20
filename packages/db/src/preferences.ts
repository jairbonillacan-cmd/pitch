/**
 * Preferencias de cuenta del socio persistidas en Postgres (`user_preferences`) con
 * sincronización bidireccional de visibilidad pública (`users.public_profile`).
 */
import { eq } from "drizzle-orm";
import type { Db } from "./billing";
import { userPreferences, users } from "./schema";

export type OddsFormatPref = "american" | "decimal";
export type ThemeModePref = "dark" | "light" | "system";
export type RiskPreference = "conservador" | "medio" | "arriesgado";
export type ResponsiblePauseKind = "24h" | "7d" | "30d";
export type AlertCadencePref = "inmediato" | "cada_15m" | "solo_hitos";

export interface SavedScreenerViewPref {
  id: string;
  name: string;
  sport: string;
  league: string;
  band: string;
  kind: string;
  sort: string;
  onlyPositiveEdge: boolean;
  minOddsStep: number;
  maxOddsStep: number;
  window: string;
}

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

const VALID_ALERT_CADENCE = new Set<AlertCadencePref>(["inmediato", "cada_15m", "solo_hitos"]);

export function sanitizeSavedViewsPref(raw: unknown): SavedScreenerViewPref[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedScreenerViewPref[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim().slice(0, 48) : "";
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 40) : "";
    if (id.length < 2 || name.length < 2 || seen.has(id)) continue;
    seen.add(id);
    const minOddsStep =
      typeof obj.minOddsStep === "number" && Number.isFinite(obj.minOddsStep)
        ? Math.max(0, Math.min(99, Math.round(obj.minOddsStep)))
        : 0;
    const maxOddsStep =
      typeof obj.maxOddsStep === "number" && Number.isFinite(obj.maxOddsStep)
        ? Math.max(minOddsStep + 1, Math.min(100, Math.round(obj.maxOddsStep)))
        : 100;
    out.push({
      id,
      name,
      sport: typeof obj.sport === "string" ? obj.sport.trim().slice(0, 24) : "all",
      league: typeof obj.league === "string" ? obj.league.trim().slice(0, 48) : "all",
      band: typeof obj.band === "string" ? obj.band.trim().slice(0, 24) : "all",
      kind: typeof obj.kind === "string" ? obj.kind.trim().slice(0, 24) : "all",
      sort: typeof obj.sort === "string" ? obj.sort.trim().slice(0, 24) : "p",
      onlyPositiveEdge: Boolean(obj.onlyPositiveEdge),
      minOddsStep,
      maxOddsStep,
      window: typeof obj.window === "string" ? obj.window.trim().slice(0, 24) : "all",
    });
    if (out.length >= 12) break;
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
  const books = cleanList(obj.books, 20);
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
  /** Privacidad de Mi récord por bloque y dato (la normaliza la app). */
  recordPrivacy: Record<string, unknown>;
  /** Banca inicial en pesos (centavos); siempre privada. */
  bankrollStartMxnCentavos: number | null;
  /** Ligas y equipos seguidos en Comunidad (+ casas informativas de referencia). */
  followedTopics: FollowedTopicsPref;
  /** Jugadores seguidos por el socio (`<league>.<team>.<playerSlug>`). */
  followedPlayers: string[];
  /** Casas de referencia informativas seleccionadas por el socio. */
  preferredBooks: string[];
  /** Mostrar competiciones sin partidos en los próximos 30 días. */
  showInactiveLeagues: boolean;
  /** Recibir alertas cuando una línea se mueva ≥ 5 % a favor del modelo. */
  lineMoveAlerts: boolean;
  /** Idioma preferido (`es-MX`). */
  language: string;
  /** Frecuencia máxima de notificaciones push/en-app (`inmediato`, `cada_15m`, `solo_hitos`). */
  alertCadence: AlertCadencePref;
  /** Vistas guardadas del explorador de picks (`/app/picks`). */
  savedViews: SavedScreenerViewPref[];
  /** Insignias destacadas (máximo 3); la app las filtra contra las que el socio ya ganó. */
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
  preferredBooks?: string[];
  showInactiveLeagues?: boolean;
  lineMoveAlerts?: boolean;
  language?: string;
  alertCadence?: AlertCadencePref;
  savedViews?: SavedScreenerViewPref[];
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

/** Fila de `user_preferences` (o su ausencia) a preferencias completas. */
export function toUserPreferencesRecord(
  pref: typeof userPreferences.$inferSelect | undefined,
  publicProfile: boolean | null,
): UserPreferencesRecord {
  const fallbackPublic = publicProfile ?? true;
  if (!pref) return defaultUserPreferences(fallbackPublic);

  const ft = sanitizeFollowedTopics((pref as { followedTopics?: unknown }).followedTopics);

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
      pref.recordPrivacy && typeof pref.recordPrivacy === "object" ? (pref.recordPrivacy as Record<string, unknown>) : {},
    bankrollStartMxnCentavos: pref.bankrollStartMxnCentavos ?? null,
    followedTopics: ft,
    followedPlayers: ft.players ?? [],
    preferredBooks: ft.books && ft.books.length > 0 ? ft.books : [...DEFAULT_BOOKS],
    showInactiveLeagues: ft.showInactiveLeagues ?? false,
    lineMoveAlerts: ft.lineMoveAlerts ?? true,
    language: ft.language ?? "es-MX",
    alertCadence: ft.alertCadence ?? "inmediato",
    savedViews: ft.savedViews ?? [],
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
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
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
    // «Perfil público» y «Aparecer en el ranking» son independientes, con una sola regla:
    // sin perfil público no hay ranking (el ranking muestra el récord). Salir del ranking
    // no vuelve privado el perfil.
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
      patch.followedTopics !== undefined ? sanitizeFollowedTopics(patch.followedTopics) : current.followedTopics;
    const nextBooks =
      patch.preferredBooks !== undefined
        ? Array.from(new Set(patch.preferredBooks.map((b) => b.trim().toLowerCase()).filter(Boolean))).slice(0, 20)
        : baseFollowedTopics.books ?? current.preferredBooks;
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
        : baseFollowedTopics.savedViews ?? current.savedViews;
    const followedTopics: FollowedTopicsPref = {
      leagues: baseFollowedTopics.leagues,
      teams: baseFollowedTopics.teams,
      ...(nextPlayers.length > 0 ? { players: nextPlayers } : {}),
      ...(nextBooks.length > 0 ? { books: nextBooks } : {}),
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
          updatedAt: now,
        },
      });

    if (patch.publicRecordVisible !== undefined) {
      await t.update(users).set({ publicProfile: publicRecordVisible }).where(eq(users.id, userId));
    }

    return getUserPreferences(t, userId);
  });
}
