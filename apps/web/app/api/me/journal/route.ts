import { NextResponse } from "next/server";
import { asMarketKey } from "@pitchlab/contracts";
import type { SealedParlayLegSpec } from "@pitchlab/db";
import { checkParlayCompatibility, computeParlaySummary } from "@pitchlab/ui/parlay";
import type { MatchPick, ParlayLeg, PickConflictGroup, PlatformGame, PlatformMarketRow } from "@pitchlab/ui/types";
import { normalizeClosingSelectionAndLine } from "../../../../src/server/closing-odds";
import { findGameKickoff } from "../../../../src/server/game-kickoff";
import { recordMemberFunnelIfConsented } from "../../../../src/server/funnel";
import { listJournal, sealPick } from "../../../../src/server/member-data";
import { outlookDetailFor } from "../../../../src/server/outlook";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireActivePaseMember, requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const parsedLine = normalizeClosingSelectionAndLine(direct.market ?? "", direct.selectionKey ?? "", direct.line ?? null);
    const numLine = parsedLine.lineKey !== "" ? Number(parsedLine.lineKey) : null;
    return {
      matchPick: direct,
      leagueLabel: direct.leagueLabel,
      matchLabel: direct.matchLabel,
      pickLabel: direct.label,
      market: direct.market ?? null,
      selection: direct.selectionKey ?? null,
      line: Number.isFinite(numLine) ? numLine : (direct.line ?? null),
      fairDecimal: direct.fairDecimal,
    };
  }

  if (!pickId.startsWith(`${game.id}__mkt__`)) return null;
  const mktRow = serverMarketsForGame(game).find((row) => matchMarketRowId(game.id, row) === pickId);
  if (!mktRow || !Number.isFinite(mktRow.fairDecimal) || mktRow.fairDecimal < 1.01) return null;

  const parsed = normalizeClosingSelectionAndLine(mktRow.market, mktRow.selection, mktRow.line ?? null);
  const resolvedLine =
    parsed.lineKey !== "" && Number.isFinite(Number(parsed.lineKey))
      ? Number(parsed.lineKey)
      : (mktRow.line ?? null);
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

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({ entries: await listJournal(member.db, member.userId) });
}

/**
 * Sella un pick oficial o un parlay combinado antes del inicio. El momio justo (`fairDecimal`),
 * las etiquetas y la hora de inicio provienen exclusivamente del catálogo del servidor (SEC-07).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "journal-seal",
    key: member.userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : null);
  const num = (k: string) => (typeof body?.[k] === "number" ? (body[k] as number) : null);
  const gameId = str("gameId")?.trim() ?? null;
  const pickId = str("pickId")?.trim() ?? null;
  const units = num("units");
  const userDecimal = num("userDecimal");
  if (!body || !gameId || !pickId || units === null || userDecimal === null) {
    return NextResponse.json({ error: "Datos del pick incompletos" }, { status: 400 });
  }

  const now = new Date();
  const dataset = buildServerRawPlatformDataset();
  const isParlayPayload = body.pickKind === "parlay" || Array.isArray(body.parlayLegs) || pickId.startsWith("parlay:");

  let result;
  if (isParlayPayload) {
    const rawLegs = Array.isArray(body.parlayLegs) ? body.parlayLegs : null;
    if (!rawLegs || rawLegs.length < 2 || rawLegs.length > 6) {
      return NextResponse.json(
        { ok: false, reason: "parlay_invalido", error: "El parlay requiere entre 2 y 6 selecciones." },
        { status: 400 },
      );
    }

    const allowSgp = body.allowSgp !== false;
    const gamesById = new Map(dataset.games.map((g) => [g.id, g]));
    const acceptedLegs: ParlayLeg[] = [];
    const parlaySpecs: SealedParlayLegSpec[] = [];
    let earliestKickoffAt: Date | null = null;
    let earliestGameId = gameId;

    for (const rawLeg of rawLegs) {
      if (!rawLeg || typeof rawLeg !== "object") {
        return NextResponse.json(
          { ok: false, reason: "parlay_invalido", error: "Selección de parlay inválida." },
          { status: 400 },
        );
      }
      const legRecord = rawLeg as Record<string, unknown>;
      const legGameId = typeof legRecord.gameId === "string" ? legRecord.gameId.trim() : "";
      const legPickId = typeof legRecord.pickId === "string" ? legRecord.pickId.trim() : "";
      if (!legGameId || !legPickId) {
        return NextResponse.json(
          { ok: false, reason: "parlay_invalido", error: "Cada pata del parlay requiere gameId y pickId." },
          { status: 400 },
        );
      }

      const legGame = gamesById.get(legGameId);
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

      const resolved = resolveCatalogPick(legGame, legPickId);
      if (!resolved) {
        return NextResponse.json({ error: "Selección de parlay desconocida en el catálogo oficial" }, { status: 404 });
      }

      const compat = checkParlayCompatibility(acceptedLegs, resolved.matchPick, allowSgp);
      if (!compat.allowed) {
        return NextResponse.json(
          { ok: false, reason: "parlay_invalido", error: compat.reason ?? "Selecciones incompatibles en el parlay." },
          { status: 409 },
        );
      }

      acceptedLegs.push({ pick: resolved.matchPick });
      parlaySpecs.push({
        pickId: resolved.matchPick.id,
        gameId: legGame.id,
        leagueLabel: resolved.leagueLabel,
        matchLabel: resolved.matchLabel,
        pickLabel: resolved.pickLabel,
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

    const summary = computeParlaySummary(acceptedLegs, units);
    const canonicalPickId = `parlay:${acceptedLegs
      .map((l) => l.pick.id)
      .sort()
      .join("+")}`;

    result = await sealPick(
      member.db,
      member.userId,
      {
        pickId: canonicalPickId,
        gameId: earliestGameId,
        leagueLabel: "Combinada Multi-Liga",
        matchLabel: `${acceptedLegs.length} selecciones${summary.hasSgpCorrelation ? " · SGP" : ""}`,
        pickLabel: acceptedLegs.map((l) => l.pick.label).join(" + "),
        origin: "Parlay Combinado",
        pickKind: "parlay",
        parlayLegs: parlaySpecs,
        units,
        userDecimal,
        fairDecimal: summary.fairDecimal,
        kickoffAt: earliestKickoffAt!,
        note: str("note") ?? undefined,
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
      member.db,
      member.userId,
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
        note: str("note") ?? undefined,
      },
      now,
    );
  }

  if (result.ok) {
    await recordMemberFunnelIfConsented(
      member.db,
      member.userId,
      "first_sealed_pick",
      "/api/me/journal",
      { pickKind: isParlayPayload ? "parlay" : "single" },
      now,
    );
  }

  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
