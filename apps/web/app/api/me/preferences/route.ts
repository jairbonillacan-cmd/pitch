import { NextResponse } from "next/server";
import {
  getUserPreferences,
  upsertUserPreferences,
  type OddsFormatPref,
  type ResponsiblePauseKind,
  type RiskPreference,
  type ThemeModePref,
  type UserPreferencesPatch,
  type UserPreferencesRecord,
} from "@pitchlab/db";
import { normalizeRecordPrivacy } from "@pitchlab/ui/record-stats";
import { sanitizeFeaturedBadges } from "@pitchlab/ui/badges";
import { loadMemberBadges } from "../../../../src/server/badges";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ODDS_FORMATS = new Set<OddsFormatPref>(["american", "decimal"]);
const THEME_MODES = new Set<ThemeModePref>(["dark", "light", "system"]);
const RISK_PREFERENCES = new Set<RiskPreference>(["conservador", "medio", "arriesgado"]);
const PAUSE_KINDS = new Set<ResponsiblePauseKind>(["24h", "7d", "30d"]);

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
    showInRanking: pref.showInRanking,
    pauseCommunity: pref.pauseCommunity,
    responsiblePauseKind: pref.responsiblePauseKind,
    responsiblePauseUntilIso: pref.responsiblePauseUntil ? pref.responsiblePauseUntil.toISOString() : null,
    recordPrivacy: normalizeRecordPrivacy(pref.recordPrivacy),
    bankrollStartMxnCentavos: pref.bankrollStartMxnCentavos,
    featuredBadges: pref.featuredBadges,
    updatedAtIso: pref.updatedAt ? pref.updatedAt.toISOString() : null,
  };
}

function parsePatch(body: Record<string, unknown>): {
  patch?: UserPreferencesPatch;
  featuredBadges?: string[];
  error?: string;
} {
  const patch: UserPreferencesPatch = {};
  let featuredBadges: string[] | undefined;

  if (body.oddsFormat !== undefined) {
    if (typeof body.oddsFormat !== "string" || !ODDS_FORMATS.has(body.oddsFormat as OddsFormatPref)) {
      return { error: "Formato de momios inválido." };
    }
    patch.oddsFormat = body.oddsFormat as OddsFormatPref;
  }

  if (body.themeMode !== undefined) {
    if (typeof body.themeMode !== "string" || !THEME_MODES.has(body.themeMode as ThemeModePref)) {
      return { error: "Tema visual inválido." };
    }
    patch.themeMode = body.themeMode as ThemeModePref;
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || body.timezone.trim().length < 2) {
      return { error: "Zona horaria inválida." };
    }
    patch.timezone = body.timezone.trim().slice(0, 64);
  }

  if (body.riskPreference !== undefined) {
    if (
      typeof body.riskPreference !== "string" ||
      !RISK_PREFERENCES.has(body.riskPreference as RiskPreference)
    ) {
      return { error: "Perfil de riesgo inválido." };
    }
    patch.riskPreference = body.riskPreference as RiskPreference;
  }

  if (body.favoriteLeagues !== undefined) {
    if (!Array.isArray(body.favoriteLeagues)) {
      return { error: "Lista de ligas favoritas inválida." };
    }
    const clean = body.favoriteLeagues
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 25);
    if (clean.length === 0) {
      return { error: "Selecciona al menos una liga favorita." };
    }
    patch.favoriteLeagues = clean;
  }

  if (body.unitMxnCentavos !== undefined || body.unitMxn !== undefined) {
    const rawCentavos =
      body.unitMxnCentavos !== undefined
        ? body.unitMxnCentavos
        : typeof body.unitMxn === "number"
          ? Math.round(body.unitMxn * 100)
          : NaN;
    if (typeof rawCentavos !== "number" || !Number.isFinite(rawCentavos) || rawCentavos < 1_000) {
      return { error: "Tu unidad en MXN debe ser de al menos $10 MXN." };
    }
    patch.unitMxnCentavos = Math.min(10_000_000, Math.round(rawCentavos));
  }

  const boolKeys = [
    "showMxnBalance",
    "publicRecordVisible",
    "emailPickResults",
    "emailValueAlerts",
    "emailBeforeMatch",
    "emailBillingReminder",
    "showInRanking",
    "pauseCommunity",
  ] as const;

  for (const key of boolKeys) {
    const val = body[key];
    if (val !== undefined) {
      if (typeof val !== "boolean") {
        return { error: `Valor inválido para ${key}.` };
      }
      patch[key] = val;
    }
  }

  if (body.responsiblePauseKind !== undefined) {
    if (body.responsiblePauseKind === null) {
      patch.responsiblePauseKind = null;
    } else if (
      typeof body.responsiblePauseKind === "string" &&
      PAUSE_KINDS.has(body.responsiblePauseKind as ResponsiblePauseKind)
    ) {
      patch.responsiblePauseKind = body.responsiblePauseKind as ResponsiblePauseKind;
    } else {
      return { error: "Duración de pausa responsable inválida." };
    }
  }

  if (body.recordPrivacy !== undefined) {
    if (!body.recordPrivacy || typeof body.recordPrivacy !== "object" || Array.isArray(body.recordPrivacy)) {
      return { error: "Privacidad de Mi récord inválida." };
    }
    patch.recordPrivacy = normalizeRecordPrivacy(body.recordPrivacy) as unknown as Record<string, unknown>;
  }

  if (body.bankrollStartMxnCentavos !== undefined || body.bankrollStartMxn !== undefined) {
    const rawBank =
      body.bankrollStartMxnCentavos !== undefined
        ? body.bankrollStartMxnCentavos
        : body.bankrollStartMxn === null
          ? null
          : typeof body.bankrollStartMxn === "number"
            ? Math.round(body.bankrollStartMxn * 100)
            : NaN;
    if (rawBank === null) {
      patch.bankrollStartMxnCentavos = null;
    } else if (typeof rawBank !== "number" || !Number.isFinite(rawBank) || rawBank < 0 || rawBank > 1_000_000_000) {
      return { error: "La banca inicial debe ser un monto entre $0 y $10,000,000 MXN." };
    } else {
      patch.bankrollStartMxnCentavos = Math.round(rawBank);
    }
  }

  if (body.featuredBadges !== undefined) {
    if (!Array.isArray(body.featuredBadges) || body.featuredBadges.some((b) => typeof b !== "string")) {
      return { error: "Insignias destacadas inválidas." };
    }
    if (body.featuredBadges.length > 3) {
      return { error: "Puedes destacar hasta 3 insignias." };
    }
    featuredBadges = (body.featuredBadges as string[]).map((b) => b.slice(0, 80));
  }

  return { patch, featuredBadges };
}

/** GET /api/me/preferences — devuelve preferencias persistidas del socio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const preferences = await getUserPreferences(member.db, member.userId);
  return NextResponse.json(
    { ok: true, preferences: serializePreferences(preferences) },
    { headers: NO_STORE },
  );
}

/** PUT /api/me/preferences — actualiza preferencias y sincroniza `users.public_profile`. */
export async function PUT(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-preferences-put",
    key: member.userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const raw = (await request.json().catch(() => null)) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Cuerpo de preferencias inválido." }, { status: 400 });
  }

  const parsed = parsePatch(raw as Record<string, unknown>);
  if (!parsed.patch) {
    return NextResponse.json({ error: parsed.error ?? "Preferencias inválidas." }, { status: 400 });
  }

  const now = new Date();
  let preferences = await upsertUserPreferences(member.db, member.userId, parsed.patch, now);
  if (parsed.featuredBadges !== undefined) {
    // Solo se destacan insignias ganadas y visibles con la privacidad que acaba de guardarse.
    const badges = await loadMemberBadges(member.db, member.userId, now);
    const featured = sanitizeFeaturedBadges(parsed.featuredBadges, badges?.public ?? []);
    if (featured.length !== parsed.featuredBadges.length) {
      return NextResponse.json(
        { error: "Solo puedes destacar insignias que ya ganaste y que son públicas." },
        { status: 400 },
      );
    }
    preferences = await upsertUserPreferences(member.db, member.userId, { featuredBadges: featured }, now);
  }
  return NextResponse.json(
    { ok: true, preferences: serializePreferences(preferences) },
    { headers: NO_STORE },
  );
}
