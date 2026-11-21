import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import {
  getUserPreferences,
  MAX_PREFERRED_BOOKMAKERS,
  MAX_SAVED_SCREENER_VIEWS,
  sanitizeFollowedTopics,
  sanitizePreferredBookmakers,
  sanitizeSavedViewsPref,
  upsertUserPreferences,
  type UserPreferencesPatch,
  type UserPreferencesRecord,
} from "@pitchlab/db";
import { sanitizeFeaturedBadges } from "@pitchlab/ui/badges";
import { sanitizePreferredBooks } from "@pitchlab/ui/bookmakers";
import { normalizeRecordPrivacy } from "@pitchlab/ui/record-stats";
import { withMemberMutation, withSessionRead } from "../../../../src/server/api-guards";
import { loadMemberBadges } from "../../../../src/server/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SavedViewInputSchema = z
  .object({
    id: z.string().trim().min(2).max(48),
    name: z.string().trim().min(2).max(40),
    sport: z.string().max(24).optional(),
    league: z.string().max(48).optional(),
    band: z.string().max(24).optional(),
    kind: z.string().max(24).optional(),
    sort: z.string().max(24).optional(),
    onlyPositiveEdge: z.boolean().optional(),
    minOddsStep: z.number().finite().min(0).max(99).optional(),
    maxOddsStep: z.number().finite().min(1).max(100).optional(),
    window: z.string().max(24).optional(),
    pinToHomeHub: z.boolean().optional(),
  })
  .strict();

const FollowedTopicsInputSchema = z
  .object({
    leagues: z.array(z.string().max(80)).max(60).optional(),
    teams: z.array(z.string().max(80)).max(80).optional(),
    players: z.array(z.string().max(80)).max(60).optional(),
    books: z.array(z.string().max(64)).max(MAX_PREFERRED_BOOKMAKERS).optional(),
    showInactiveLeagues: z.boolean().optional(),
    lineMoveAlerts: z.boolean().optional(),
    language: z.string().max(16).optional(),
    alertCadence: z.enum(["inmediato", "cada_15m", "solo_hitos"]).optional(),
    savedViews: z.array(SavedViewInputSchema).max(MAX_SAVED_SCREENER_VIEWS).optional(),
  })
  .strict();

const PreferencesBodySchema = z
  .object({
    oddsFormat: z.enum(["american", "decimal"]).optional(),
    themeMode: z.enum(["dark", "light", "system"]).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    riskPreference: z.enum(["conservador", "medio", "arriesgado"]).optional(),
    favoriteLeagues: z.array(z.string().max(80)).max(60).optional(),
    unitMxnCentavos: z.number().finite().optional(),
    unitMxn: z.number().finite().optional(),
    showMxnBalance: z.boolean().optional(),
    publicRecordVisible: z.boolean().optional(),
    emailPickResults: z.boolean().optional(),
    emailValueAlerts: z.boolean().optional(),
    emailBeforeMatch: z.boolean().optional(),
    emailBillingReminder: z.boolean().optional(),
    emailWeeklyDigest: z.boolean().optional(),
    emailMonthlyRecord: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    showInRanking: z.boolean().optional(),
    pauseCommunity: z.boolean().optional(),
    showInactiveLeagues: z.boolean().optional(),
    lineMoveAlerts: z.boolean().optional(),
    responsiblePauseKind: z.enum(["24h", "7d", "30d"]).nullable().optional(),
    recordPrivacy: z.record(z.string(), z.unknown()).optional(),
    bankrollStartMxnCentavos: z.number().finite().nullable().optional(),
    bankrollStartMxn: z.number().finite().nullable().optional(),
    followedTopics: FollowedTopicsInputSchema.optional(),
    preferredBookmakers: z.array(z.string().max(64)).max(MAX_PREFERRED_BOOKMAKERS).optional(),
    preferredBooks: z.array(z.string().max(64)).max(24).optional(),
    followedPlayers: z.array(z.string().max(80)).max(60).optional(),
    language: z.string().trim().min(2).max(16).optional(),
    alertCadence: z.enum(["inmediato", "cada_15m", "solo_hitos"]).optional(),
    savedViews: z.array(SavedViewInputSchema).max(MAX_SAVED_SCREENER_VIEWS).optional(),
    featuredBadges: z.array(z.string().max(80)).max(3).optional(),
  })
  .strict();

function validationErrorResponse(message: string): NextResponse {
  const sanitized = createSanitizedErrorPayload("VALIDATION_ERROR", message);
  return NextResponse.json(
    { ok: false, error: sanitized.message, code: sanitized.code },
    { status: 400 },
  );
}

function serializePreferences(pref: UserPreferencesRecord) {
  return {
    oddsFormat: pref.oddsFormat,
    themeMode: pref.themeMode,
    timezone: pref.timezone,
    riskPreference: pref.riskPreference,
    favoriteLeagues: pref.favoriteLeagues,
    unitMxnCentavos: pref.unitMxnCentavos,
    unitMxn: Math.round(pref.unitMxnCentavos / 100),
    showMxnBalance: pref.showMxnBalance,
    publicRecordVisible: pref.publicRecordVisible,
    emailPickResults: pref.emailPickResults,
    emailValueAlerts: pref.emailValueAlerts,
    emailBeforeMatch: pref.emailBeforeMatch,
    emailBillingReminder: pref.emailBillingReminder,
    emailWeeklyDigest: pref.emailWeeklyDigest,
    emailMonthlyRecord: pref.emailMonthlyRecord,
    pushEnabled: pref.pushEnabled,
    showInRanking: pref.showInRanking,
    pauseCommunity: pref.pauseCommunity,
    responsiblePauseKind: pref.responsiblePauseKind,
    responsiblePauseUntilIso: pref.responsiblePauseUntil
      ? pref.responsiblePauseUntil.toISOString()
      : null,
    recordPrivacy: normalizeRecordPrivacy(pref.recordPrivacy),
    bankrollStartMxnCentavos: pref.bankrollStartMxnCentavos,
    followedTopics: pref.followedTopics,
    followedPlayers: pref.followedPlayers,
    preferredBookmakers: pref.preferredBookmakers,
    preferredBooks: sanitizePreferredBooks(pref.preferredBooks),
    showInactiveLeagues: pref.showInactiveLeagues,
    lineMoveAlerts: pref.lineMoveAlerts,
    language: pref.language,
    alertCadence: pref.alertCadence,
    savedViews: pref.savedViews,
    featuredBadges: pref.featuredBadges,
    updatedAtIso: pref.updatedAt ? pref.updatedAt.toISOString() : null,
  };
}

function parsePatch(raw: unknown): {
  patch?: UserPreferencesPatch;
  featuredBadges?: string[];
  error?: string;
} {
  const parsed = PreferencesBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Preferencias inválidas." };
  }

  const data = parsed.data;
  const patch: UserPreferencesPatch = {};
  let featuredBadges: string[] | undefined;

  if (data.oddsFormat !== undefined) patch.oddsFormat = data.oddsFormat;
  if (data.themeMode !== undefined) patch.themeMode = data.themeMode;
  if (data.timezone !== undefined) patch.timezone = data.timezone;
  if (data.riskPreference !== undefined) patch.riskPreference = data.riskPreference;

  if (data.favoriteLeagues !== undefined) {
    const clean = Array.from(
      new Set(data.favoriteLeagues.map((v) => v.trim()).filter(Boolean)),
    ).slice(0, 60);
    if (clean.length === 0) {
      return { error: "Selecciona al menos una liga favorita." };
    }
    patch.favoriteLeagues = clean;
  }

  if (data.unitMxnCentavos !== undefined || data.unitMxn !== undefined) {
    const rawCentavos =
      data.unitMxnCentavos !== undefined
        ? data.unitMxnCentavos
        : Math.round((data.unitMxn ?? 0) * 100);
    if (rawCentavos < 1_000) {
      return { error: "Tu unidad en MXN debe ser de al menos $10 MXN." };
    }
    patch.unitMxnCentavos = Math.min(10_000_000, Math.round(rawCentavos));
  }

  if (data.showMxnBalance !== undefined) patch.showMxnBalance = data.showMxnBalance;
  if (data.publicRecordVisible !== undefined) patch.publicRecordVisible = data.publicRecordVisible;
  if (data.emailPickResults !== undefined) patch.emailPickResults = data.emailPickResults;
  if (data.emailValueAlerts !== undefined) patch.emailValueAlerts = data.emailValueAlerts;
  if (data.emailBeforeMatch !== undefined) patch.emailBeforeMatch = data.emailBeforeMatch;
  if (data.emailBillingReminder !== undefined) {
    patch.emailBillingReminder = data.emailBillingReminder;
  }
  if (data.emailWeeklyDigest !== undefined) patch.emailWeeklyDigest = data.emailWeeklyDigest;
  if (data.emailMonthlyRecord !== undefined) patch.emailMonthlyRecord = data.emailMonthlyRecord;
  if (data.pushEnabled !== undefined) patch.pushEnabled = data.pushEnabled;
  if (data.showInRanking !== undefined) patch.showInRanking = data.showInRanking;
  if (data.pauseCommunity !== undefined) patch.pauseCommunity = data.pauseCommunity;
  if (data.showInactiveLeagues !== undefined) patch.showInactiveLeagues = data.showInactiveLeagues;
  if (data.lineMoveAlerts !== undefined) patch.lineMoveAlerts = data.lineMoveAlerts;
  if (data.responsiblePauseKind !== undefined) {
    patch.responsiblePauseKind = data.responsiblePauseKind;
  }

  if (data.recordPrivacy !== undefined) {
    patch.recordPrivacy = normalizeRecordPrivacy(
      data.recordPrivacy,
    ) as unknown as Record<string, unknown>;
  }

  if (data.bankrollStartMxnCentavos !== undefined || data.bankrollStartMxn !== undefined) {
    const rawBank =
      data.bankrollStartMxnCentavos !== undefined
        ? data.bankrollStartMxnCentavos
        : data.bankrollStartMxn === null
          ? null
          : Math.round((data.bankrollStartMxn ?? 0) * 100);
    if (rawBank === null) {
      patch.bankrollStartMxnCentavos = null;
    } else if (rawBank < 0 || rawBank > 1_000_000_000) {
      return { error: "La banca inicial debe ser un monto entre $0 y $10,000,000 MXN." };
    } else {
      patch.bankrollStartMxnCentavos = Math.round(rawBank);
    }
  }

  if (data.followedTopics !== undefined) {
    patch.followedTopics = sanitizeFollowedTopics(data.followedTopics);
  }

  if (data.preferredBookmakers !== undefined) {
    patch.preferredBookmakers = sanitizePreferredBookmakers(data.preferredBookmakers);
  }

  if (data.preferredBooks !== undefined) {
    patch.preferredBooks = sanitizePreferredBooks(data.preferredBooks);
  }

  if (data.followedPlayers !== undefined) {
    patch.followedPlayers = Array.from(
      new Set(data.followedPlayers.map((p) => p.trim()).filter((p) => p.length > 0 && p.length <= 80)),
    ).slice(0, 60);
  }

  if (data.language !== undefined) patch.language = data.language;
  if (data.alertCadence !== undefined) patch.alertCadence = data.alertCadence;

  if (data.savedViews !== undefined) {
    patch.savedViews = sanitizeSavedViewsPref(data.savedViews);
  }

  if (data.featuredBadges !== undefined) {
    featuredBadges = data.featuredBadges.map((b) => b.slice(0, 80));
  }

  return { patch, featuredBadges };
}

export const GET = withSessionRead(
  { bucket: "me-preferences", allowBeta: false },
  async ({ user }) => {
    const preferences = await getUserPreferences(user.db, user.userId);
    return NextResponse.json({
      ok: true,
      preferences: serializePreferences(preferences),
    });
  },
);

export const PUT = withMemberMutation(
  { bucket: "me-preferences-put", limit: 30, windowMs: 60_000 },
  async ({ request, user }) => {
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return validationErrorResponse("Cuerpo de preferencias inválido.");
    }

    const parsed = parsePatch(raw);
    if (!parsed.patch) {
      return validationErrorResponse(parsed.error ?? "Preferencias inválidas.");
    }

    const now = new Date();
    let preferences = await upsertUserPreferences(user.db, user.userId, parsed.patch, now);
    if (parsed.featuredBadges !== undefined) {
      const badges = await loadMemberBadges(user.db, user.userId, now);
      const featured = sanitizeFeaturedBadges(parsed.featuredBadges, badges?.public ?? []);
      if (featured.length !== parsed.featuredBadges.length) {
        return validationErrorResponse(
          "Solo puedes destacar insignias que ya ganaste y que son públicas.",
        );
      }
      preferences = await upsertUserPreferences(
        user.db,
        user.userId,
        { featuredBadges: featured },
        now,
      );
    }

    return NextResponse.json({
      ok: true,
      preferences: serializePreferences(preferences),
    });
  },
);
