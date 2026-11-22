import { NextResponse } from "next/server";
import { z } from "zod";
import {
  asMarketKey,
  createSanitizedErrorPayload,
  parseStrictFiniteNumber,
  sportScoringUnit,
} from "@pitchlab/contracts";
import type { SealedParlayLegSpec } from "@pitchlab/db";
import { checkParlayCompatibility, computeParlaySummary } from "@pitchlab/ui/parlay";
import type {
  MatchPick,
  ParlayLeg,
  PickConflictGroup,
  PlatformGame,
  PlatformMarketRow,
} from "@pitchlab/ui/types";
import { withActivePaseMutation, withSessionRead } from "../../../../src/server/api-guards";
import { normalizeClosingSelectionAndLine } from "../../../../src/server/closing-odds";
import { recordMemberFunnelIfConsented } from "../../../../src/server/funnel";
import { findGameKickoff } from "../../../../src/server/game-kickoff";
import {
  listJournal,
  MAX_JOURNAL_PAGE_SIZE,
  sealPick,
} from "../../../../src/server/member-data";
import { outlookDetailFor } from "../../../../src/server/outlook";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JOURNAL_OFFSET = 10_000;

const LABEL_HAS_UNIT_RE =
  /\b(?:goles?|puntos?|pts|carreras?|c[oó]rners?|esquinas?|faltas?|tarjetas?|amarillas?|tiros?|remates?|fueras?\s+de\s+juego|rebotes?|asistencias?|triples?)\b/i;

const BARE_OVER_UNDER_RE = /^(?:m[aá]s|menos)\s+de\s+\d+(?:\.\d+)?$/i;

function ensurePickLabelWithUnit(
  rawLabel: string,
  market: string | null,
  sport: PlatformGame["sport"],
): string {
  const label = rawLabel.trim();
  if (!label || LABEL_HAS_UNIT_RE.test(label)) return label;
  const marketKey = (market ?? "").trim().toLowerCase();
  const isCountOrTotalMarket =
    marketKey.includes("total") ||
    marketKey === "over_under" ||
    marketKey.includes("corner") ||
    marketKey.includes("card") ||
    marketKey.includes("yellow") ||
    marketKey.includes("foul") ||
    marketKey.includes("shot") ||
    marketKey.includes("sot") ||
    marketKey.includes("offside") ||
    BARE_OVER_UNDER_RE.test(label);
  if (!isCountOrTotalMarket) return label;
  const unit = marketKey.includes("corner")
    ? "córners"
    : marketKey.includes("card") || marketKey.includes("yellow")
      ? "tarjetas"
      : marketKey.includes("foul")
        ? "faltas"
        : marketKey.includes("sot")
          ? "tiros a puerta"
          : marketKey.includes("shot")
            ? "tiros"
            : marketKey.includes("offside")
              ? "fueras de juego"
              : sportScoringUnit(sport).plural;
  return `${label} ${unit}`;
}

function compactGameMatchLabel(game: PlatformGame): string {
  const home = game.home.shortName?.trim() || game.home.name.trim();
  const away = game.away.shortName?.trim() || game.away.name.trim();
  return `${home} vs ${away}`;
}

function formatParlayMatchLabel(
  specs: readonly SealedParlayLegSpec[],
  hasSgpCorrelation: boolean,
): string {
  const uniqueMatches: string[] = [];
  for (const spec of specs) {
    const clean = spec.matchLabel.trim();
    if (clean && !uniqueMatches.includes(clean)) {
      uniqueMatches.push(clean);
    }
  }
  const suffix = hasSgpCorrelation ? " · SGP" : "";
  if (uniqueMatches.length === 0) {
    return `${specs.length} selecciones${suffix}`;
  }
  if (uniqueMatches.length === 1) {
    return `${uniqueMatches[0]} · ${specs.length} selecciones${suffix}`;
  }
  if (uniqueMatches.length === 2) {
    return `${uniqueMatches[0]} · ${uniqueMatches[1]}${suffix}`;
  }
  return `${uniqueMatches[0]} · ${uniqueMatches[1]} (+${uniqueMatches.length - 2})${suffix}`;
}

function formatParlayPickLabel(specs: readonly SealedParlayLegSpec[]): string {
  return specs.map((spec) => `${spec.matchLabel}: ${spec.pickLabel}`).join(" · ");
}

function resolveParlayLeagueLabel(specs: readonly SealedParlayLegSpec[]): string {
  const leagues = new Set(specs.map((spec) => spec.leagueLabel.trim()).filter(Boolean));
  if (leagues.size === 1) {
    const only = leagues.values().next().value;
    if (only) return only;
  }
  return "Combinada Multi-Liga";
}

const JournalParlayLegSchema = z.object({
  gameId: z.string().trim().min(1).max(160),
  pickId: z.string().trim().min(1).max(256),
});

const JournalSealBodySchema = z.object({
  gameId: z.string().trim().min(1).max(160),
  pickId: z.string().trim().min(1).max(600),
  units: z.number().finite().gt(0).lte(5),
  userDecimal: z.number().finite().gte(1.01).lte(9999),
  pickKind: z.enum(["single", "parlay"]).optional(),
  parlayLegs: z.array(JournalParlayLegSchema).min(2).max(6).optional(),
  allowSgp: z.boolean().optional(),
  note: z.string().max(280).nullable().optional(),
});

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function resolveKickoff(game: PlatformGame): Date | null {
  const fromSnap = findGameKickoff(game.id);
  if (fromSnap) return fromSnap;
  const ts = Date.parse(game.kickoffUtc);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function conflictGroupForMarketRow(market: string, selection: string): PickConflictGroup {
  const norm = normalizeClosingSelectionAndLine(market, selection);
  if (norm.market === "h2h" || norm.market === "dnb") {
    if (norm.selection === "home") return "home_side";
    if (norm.selection === "away") return "away_side";
    if (norm.selection === "draw") return "draw_side";
  }
  if (norm.market === "totals") {
    if (norm.selection === "over") return "over_total";
    if (norm.selection === "under") return "under_total";
  }
  if (norm.market === "btts") {
    if (norm.selection === "yes") return "btts_yes";
    if (norm.selection === "no") return "btts_no";
  }
  return "independent";
}

function serverMarketsForGame(game: PlatformGame): readonly PlatformMarketRow[] {
  const v32 = game.status !== "FT" ? outlookDetailFor(game) : null;
  if (!v32) return game.markets;
  return [...v32.markets, ...game.markets];
}

function matchMarketRowId(gameId: string, row: PlatformMarketRow): string {
  return `${gameId}__mkt__${encodeURIComponent(row.group)}__${encodeURIComponent(row.selection)}`;
}

function resolveCatalogPick(
  game: PlatformGame,
  pickId: string,
): {
  matchPick: MatchPick;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  market: string | null;
  selection: string | null;
  line: number | null;
  fairDecimal: number;
} | null {
  const direct = game.picks.find((p) => p.id === pickId);
  if (direct) {
    const parsedLine = normalizeClosingSelectionAndLine(
      direct.market ?? "",
      direct.selectionKey ?? "",
      direct.line ?? null,
    );
    const numLine = parsedLine.lineKey !== "" ? parseStrictFiniteNumber(parsedLine.lineKey) : null;
    return {
      matchPick: direct,
      leagueLabel: direct.leagueLabel,
      matchLabel: direct.matchLabel,
      pickLabel: direct.label,
      market: direct.market ?? null,
      selection: direct.selectionKey ?? null,
      line: numLine ?? (direct.line ?? null),
      fairDecimal: direct.fairDecimal,
    };
  }

  if (!pickId.startsWith(`${game.id}__mkt__`)) return null;
  const mktRow = serverMarketsForGame(game).find((row) => matchMarketRowId(game.id, row) === pickId);
  if (!mktRow || !Number.isFinite(mktRow.fairDecimal) || mktRow.fairDecimal < 1.01) return null;

  const parsed = normalizeClosingSelectionAndLine(mktRow.market, mktRow.selection, mktRow.line ?? null);
  const parsedMarketLine = parsed.lineKey !== "" ? parseStrictFiniteNumber(parsed.lineKey) : null;
  const resolvedLine = parsedMarketLine ?? (mktRow.line ?? null);
  const matchLabel = `${game.home.name} vs ${game.away.name}`;
  const conflictGroup = conflictGroupForMarketRow(mktRow.market, mktRow.selection);
  const syntheticPick: MatchPick = {
    id: pickId,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 99,
    category: "valor",
    categoryLabel: "Valor",
    risk: "medio",
    engineKey: "singularity",
    engineName: "Spacetime Suite",
    marketGroup: mktRow.group,
    selectionKey: mktRow.selection,
    market: asMarketKey(mktRow.market),
    line: resolvedLine,
    conflictGroup,
    label: mktRow.label,
    rationale: `Mercado oficial · ${mktRow.group}`,
    p: mktRow.p,
    fairDecimal: mktRow.fairDecimal,
    fairAmerican: mktRow.fairAmerican,
    marketDecimal: mktRow.currentDecimal,
    marketAmerican: null,
    edgePts: mktRow.edgePts,
    confidenceScore: game.confidenceScore,
    suggestedUnits: 1,
    isRedacted: false,
  };

  return {
    matchPick: syntheticPick,
    leagueLabel: game.leagueLabel,
    matchLabel,
    pickLabel: mktRow.label,
    market: mktRow.market,
    selection: mktRow.selection,
    line: resolvedLine,
    fairDecimal: mktRow.fairDecimal,
  };
}

export const GET = withSessionRead(
  {
    bucket: "me-journal-read",
    allowBetaPin: false,
    cacheControl: "private, no-store",
  },
  async ({ request, user }) => {
    const url = new URL(request.url);
    const limit = parseBoundedInt(
      url.searchParams.get("limit"),
      MAX_JOURNAL_PAGE_SIZE,
      1,
      MAX_JOURNAL_PAGE_SIZE,
    );
    const offset = parseBoundedInt(url.searchParams.get("offset"), 0, 0, MAX_JOURNAL_OFFSET);
    const entries = await listJournal(user.db, user.userId, { limit, offset });
    return NextResponse.json({ entries, limit, offset });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "journal-seal",
    limit: 30,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      void err;
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido."),
        { status: 400 },
      );
    }

    const parsed = JournalSealBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Datos del pick incompletos o inválidos",
          ...createSanitizedErrorPayload(
            "INVALID_JOURNAL_PAYLOAD",
            "Datos del pick incompletos o inválidos.",
          ),
        },
        { status: 400 },
      );
    }

    const { gameId, pickId, units, userDecimal, pickKind, parlayLegs, allowSgp, note } = parsed.data;
    const cleanNote = note ?? undefined;

    const now = new Date();
    const dataset = buildServerRawPlatformDataset();
    const isParlayPayload =
      pickKind === "parlay" || parlayLegs !== undefined || pickId.startsWith("parlay:");

    let result;
    if (isParlayPayload) {
      if (!parlayLegs || parlayLegs.length < 2 || parlayLegs.length > 6) {
        return NextResponse.json(
          {
            ok: false,
            reason: "parlay_invalido",
            error: "El parlay requiere entre 2 y 6 selecciones.",
            ...createSanitizedErrorPayload(
              "INVALID_PARLAY",
              "El parlay requiere entre 2 y 6 selecciones.",
            ),
          },
          { status: 400 },
        );
      }

      const allowSgpFlag = allowSgp !== false;
      const gamesById = new Map(dataset.games.map((g) => [g.id, g]));
      const acceptedLegs: ParlayLeg[] = [];
      const parlaySpecs: SealedParlayLegSpec[] = [];
      let earliestKickoffAt: Date | null = null;
      let earliestGameId = gameId;

      for (const leg of parlayLegs) {
        const legGame = gamesById.get(leg.gameId);
        if (!legGame) {
          return NextResponse.json({ error: "Partido de parlay desconocido" }, { status: 404 });
        }
        if (legGame.status !== "NS") {
          return NextResponse.json({ ok: false, reason: "partido_iniciado" }, { status: 409 });
        }
        const legKickoff = resolveKickoff(legGame);
        if (!legKickoff) {
          return NextResponse.json({ error: "Partido de parlay desconocido" }, { status: 404 });
        }
        if (now >= legKickoff) {
          return NextResponse.json({ ok: false, reason: "partido_iniciado" }, { status: 409 });
        }

        const resolved = resolveCatalogPick(legGame, leg.pickId);
        if (!resolved) {
          return NextResponse.json(
            { error: "Selección de parlay desconocida en el catálogo oficial" },
            { status: 404 },
          );
        }

        const compat = checkParlayCompatibility(acceptedLegs, resolved.matchPick, allowSgpFlag);
        if (!compat.allowed) {
          return NextResponse.json(
            {
              ok: false,
              reason: "parlay_invalido",
              error: compat.reason ?? "Selecciones incompatibles en el parlay.",
            },
            { status: 409 },
          );
        }

        acceptedLegs.push({ pick: resolved.matchPick });
        const normalizedLegMatchLabel =
          resolved.matchLabel?.trim() || compactGameMatchLabel(legGame);
        const normalizedLegLeagueLabel =
          resolved.leagueLabel?.trim() || legGame.leagueLabel;
        const normalizedLegPickLabel = ensurePickLabelWithUnit(
          resolved.pickLabel,
          resolved.market,
          legGame.sport,
        );
        parlaySpecs.push({
          pickId: resolved.matchPick.id,
          gameId: legGame.id,
          leagueLabel: normalizedLegLeagueLabel,
          matchLabel: normalizedLegMatchLabel,
          pickLabel: normalizedLegPickLabel,
          market: resolved.market ?? "",
          selection: resolved.selection ?? "",
          line: resolved.line,
          p: resolved.matchPick.p,
          fairDecimal: resolved.fairDecimal,
          kickoffAt: legKickoff.toISOString(),
        });

        if (!earliestKickoffAt || legKickoff.getTime() < earliestKickoffAt.getTime()) {
          earliestKickoffAt = legKickoff;
          earliestGameId = legGame.id;
        }
      }

      if (!earliestKickoffAt) {
        return NextResponse.json(
          { ok: false, reason: "parlay_invalido", error: "El parlay requiere al menos 2 selecciones." },
          { status: 400 },
        );
      }

      const summary = computeParlaySummary(acceptedLegs, units);
      const canonicalPickId = `parlay:${acceptedLegs
        .map((l) => l.pick.id)
        .sort()
        .join("+")}`;

      result = await sealPick(
        user.db,
        user.userId,
        {
          pickId: canonicalPickId,
          gameId: earliestGameId,
          leagueLabel: resolveParlayLeagueLabel(parlaySpecs),
          matchLabel: formatParlayMatchLabel(parlaySpecs, summary.hasSgpCorrelation),
          pickLabel: formatParlayPickLabel(parlaySpecs),
          origin: "Parlay Combinado",
          pickKind: "parlay",
          parlayLegs: parlaySpecs,
          units,
          userDecimal,
          fairDecimal: summary.fairDecimal,
          kickoffAt: earliestKickoffAt,
          note: cleanNote,
        },
        now,
      );
    } else {
      const catalogGame = dataset.games.find((g) => g.id === gameId);
      if (!catalogGame) return NextResponse.json({ error: "Partido desconocido" }, { status: 404 });
      if (catalogGame.status !== "NS") {
        return NextResponse.json({ ok: false, reason: "partido_iniciado" }, { status: 409 });
      }
      const resolved = resolveCatalogPick(catalogGame, pickId);
      if (!resolved) {
        return NextResponse.json({ error: "Pick desconocido en el catálogo oficial" }, { status: 404 });
      }
      const kickoffAt = resolveKickoff(catalogGame);
      if (!kickoffAt) return NextResponse.json({ error: "Partido desconocido" }, { status: 404 });

      result = await sealPick(
        user.db,
        user.userId,
        {
          pickId: resolved.matchPick.id,
          gameId: catalogGame.id,
          leagueLabel: resolved.leagueLabel,
          matchLabel: resolved.matchLabel,
          pickLabel: resolved.pickLabel,
          origin: "Spacetime Suite",
          pickKind: "single",
          pickMarket: resolved.market,
          pickSelection: resolved.selection,
          pickLine: resolved.line,
          units,
          userDecimal,
          fairDecimal: resolved.fairDecimal,
          kickoffAt,
          note: cleanNote,
        },
        now,
      );
    }

    if (result.ok) {
      await recordMemberFunnelIfConsented(
        user.db,
        user.userId,
        "first_sealed_pick",
        "/api/me/journal",
        { pickKind: isParlayPayload ? "parlay" : "single" },
        now,
      );
    }

    return NextResponse.json(result, { status: result.ok ? 201 : 409 });
  },
);
