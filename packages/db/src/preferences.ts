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

export interface FollowedTopicsPref {
  leagues: string[];
  teams: string[];
  books?: string[];
}

export function sanitizeFollowedTopics(raw: unknown): FollowedTopicsPref {
  const cleanList = (v: unknown): string[] =>
    Array.isArray(v)
      ? Array.from(
          new Set(
            v
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim())
              .filter((x) => x.length > 0 && x.length <= 80),
          ),
        ).slice(0, 40)
      : [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { leagues: [], teams: [] };
  }
  const obj = raw as Record<string, unknown>;
  const books = cleanList(obj.books);
  return {
    leagues: cleanList(obj.leagues),
    teams: cleanList(obj.teams),
    ...(books.length > 0 ? { books } : {}),
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
  /** Casas de referencia informativas seleccionadas por el socio. */
  preferredBooks: string[];
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
  preferredBooks?: string[];
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
    followedTopics: { leagues: [], teams: [], books: [...DEFAULT_BOOKS] },
    preferredBooks: [...DEFAULT_BOOKS],
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
    followedTopics: sanitizeFollowedTopics((pref as { followedTopics?: unknown }).followedTopics),
    preferredBooks: (() => {
      const ft = sanitizeFollowedTopics((pref as { followedTopics?: unknown }).followedTopics);
      return ft.books && ft.books.length > 0 ? ft.books : [...DEFAULT_BOOKS];
    })(),
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
        ? Array.from(new Set(patch.favoriteLeagues.map((l) => l.trim()).filter(Boolean))).slice(0, 20)
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
        ? Array.from(new Set(patch.preferredBooks.map((b) => b.trim().toLowerCase()).filter(Boolean))).slice(0, 12)
        : baseFollowedTopics.books ?? current.preferredBooks;
    const followedTopics: FollowedTopicsPref = {
      leagues: baseFollowedTopics.leagues,
      teams: baseFollowedTopics.teams,
      ...(nextBooks.length > 0 ? { books: nextBooks } : {}),
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
