/**
 * Motor de liquidación automática para picks simples y parlays sellados en Neon.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { asMarketKey, LeagueSnapshotSchema, selectionHolds } from "@pitchlab/contracts";
import {
  and,
  eq,
  lte,
  recordMatchResults,
  sealedPicks,
  type ClosingOddsRow,
  type Db,
  type SealedParlayLegResult,
  type SealedParlayLegSpec,
  listClosingOddsForGames,
} from "@pitchlab/db";
import type { Mailer } from "./mailer";
import { findClosingQuoteForPick, syncPreKickoffClosingOdds } from "./closing-odds";
import { buildServerRawPlatformDataset } from "./platform-data";
import { settleAndNotify, type PickResult } from "./pick-results";
import { resolveSnapshotsRoot } from "./snapshots";

export interface FinalMatchScore {
  gameId: string;
  home: number;
  away: number;
  observedAt: string | null;
}

function resolveHistoryRoot(): string {
  return path.resolve(resolveSnapshotsRoot(), "..", "history");
}

/**
 * Reúne todos los marcadores finales verificados desde:
 * 1) `data/snapshots/*\/latest.json`
 * 2) snapshots fechados históricos `data/snapshots/*\/*.json`
 * 3) registros históricos `data/history/*.jsonl`
 */
export function loadFinalMatchScores(
  snapshotsRoot: string = resolveSnapshotsRoot(),
  historyRoot: string = resolveHistoryRoot(),
): Map<string, FinalMatchScore> {
  const scores = new Map<string, FinalMatchScore>();

  if (existsSync(snapshotsRoot)) {
    const leagues = readdirSync(snapshotsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const leagueDir of leagues) {
      const dirPath = path.join(snapshotsRoot, leagueDir.name);
      const files = readdirSync(dirPath)
        .filter(
          (f) =>
            f.endsWith(".json") &&
            f !== "injuries.json" &&
            f !== "market-pulse.json" &&
            f !== "squads.json" &&
            f !== "market-lines.json",
        )
        .sort((a, b) =>
          a === "latest.json"
            ? -1
            : b === "latest.json"
              ? 1
              : a === "season-results.json"
                ? -1
                : b === "season-results.json"
                  ? 1
                  : b.localeCompare(a),
        );

      for (const file of files) {
        try {
          const rawObj = JSON.parse(readFileSync(path.join(dirPath, file), "utf8")) as {
            games?: Array<{
              id?: string;
              status?: string;
              result?: { home?: number; away?: number; observedAt?: string };
            }>;
          };
          if (file === "season-results.json") {
            for (const game of rawObj.games ?? []) {
              if (!game?.id || game.status !== "final" || !game.result) continue;
              const { home, away, observedAt } = game.result;
              if (
                typeof home !== "number" ||
                typeof away !== "number" ||
                !Number.isInteger(home) ||
                !Number.isInteger(away) ||
                home < 0 ||
                away < 0
              ) {
                continue;
              }
              if (!scores.has(game.id)) {
                scores.set(game.id, { gameId: game.id, home, away, observedAt: observedAt ?? null });
              }
            }
            continue;
          }
          const parsed = LeagueSnapshotSchema.safeParse(rawObj);
          if (!parsed.success) continue;
          for (const game of parsed.data.games) {
            if (game.status !== "final" || !game.result) continue;
            const { home, away, observedAt } = game.result;
            if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) continue;
            if (!scores.has(game.id)) {
              scores.set(game.id, { gameId: game.id, home, away, observedAt: observedAt ?? null });
            }
          }
        } catch (err) {
          void err;
          // Archivo corrupto o en escritura: se ignora de forma segura.
        }
      }
    }
  }

  if (existsSync(historyRoot)) {
    const files = readdirSync(historyRoot).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      try {
        const lines = readFileSync(path.join(historyRoot, file), "utf8").split(/\r?\n/);
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) continue;
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          const gameId = typeof obj.id === "string" ? obj.id : null;
          const home = typeof obj.homeScore === "number" ? obj.homeScore : null;
          const away = typeof obj.awayScore === "number" ? obj.awayScore : null;
          if (!gameId || home === null || away === null || !Number.isInteger(home) || !Number.isInteger(away)) {
            continue;
          }
          if (home < 0 || away < 0 || scores.has(gameId)) continue;
          scores.set(gameId, {
            gameId,
            home,
            away,
            observedAt: typeof obj.availableAt === "string" ? obj.availableAt : null,
          });
        }
      } catch {
        // Ignora archivos históricos ilegibles sin abortar el resto.
      }
    }
  }

  return scores;
}

function normalizeMarketForGrading(rawMarket: string, selection: string): { market: string; selection: string; line?: number } {
  const m = rawMarket.trim().toLowerCase();
  const s = selection.trim().toLowerCase();

  if (m === "1x2" || m === "moneyline" || m === "h2h") {
    return { market: "h2h", selection: s };
  }
  if (m === "dnb" || m === "draw_no_bet") {
    return { market: "dnb", selection: s };
  }
  if (m.startsWith("totals_") || m === "totals" || m === "ou") {
    const match = /^(over|under)[_-]?([+-]?\d+(?:\.\d+)?)$/.exec(s);
    if (match) return { market: "totals", selection: `${match[1]}_${match[2]}`, line: Number(match[2]) };
    const mLine = /^totals_(\d+_\d+)$/.exec(m);
    if (mLine) return { market: "totals", selection: s, line: Number(mLine[1]!.replace("_", ".")) };
    return { market: "totals", selection: s };
  }
  if (m === "spread" || m === "spreads" || m === "handicap" || m === "asian_handicap" || m === "puck_line") {
    const match = /^(home|away)[_-]([+-]?\d+(?:\.\d+)?)$/.exec(s);
    if (match) return { market: "spreads", selection: match[1]!, line: Number(match[2]) };
    return { market: "spreads", selection: s };
  }
  if (m === "team_totals") {
    return { market: "team_totals", selection: s };
  }
  if (m === "correct_score") {
    return { market: "correct_score", selection: s.replace("–", "-") };
  }
  return { market: m, selection: s };
}

/**
 * Califica una selección individual contra el marcador final, incluyendo push (`void`) en
 * líneas enteras de totales, hándicaps y empate no acción (`dnb`).
 */
export function gradeSelection(
  input: { market?: string | null; selection?: string | null; line?: number | null; pickLabel?: string | null },
  home: number,
  away: number,
): PickResult | null {
  let market = input.market?.trim().toLowerCase() ?? "";
  let selection = input.selection?.trim().toLowerCase() ?? "";
  let line = typeof input.line === "number" && Number.isFinite(input.line) ? input.line : undefined;

  if (!market || !selection) {
    const label = (input.pickLabel ?? "").trim().toLowerCase();
    if (!label) return null;
    if (label === "empate") {
      market = "h2h";
      selection = "draw";
    } else if (label.endsWith(" gana")) {
      return null; // Requiere comparar nombres si no guardó market/selection.
    } else if (/^más de (\d+(?:\.\d+)?)/.test(label)) {
      const m = /^más de (\d+(?:\.\d+)?)/.exec(label)!;
      market = "totals";
      line = Number(m[1]);
      selection = `over_${line}`;
    } else if (/^menos de (\d+(?:\.\d+)?)/.test(label)) {
      const m = /^menos de (\d+(?:\.\d+)?)/.exec(label)!;
      market = "totals";
      line = Number(m[1]);
      selection = `under_${line}`;
    } else if (label.includes("ambos anotan") && label.includes("sí")) {
      market = "btts";
      selection = "yes";
    } else if (label.includes("ambos anotan") && label.includes("no")) {
      market = "btts";
      selection = "no";
    }
  }

  if (!market || !selection) return null;
  const norm = normalizeMarketForGrading(market, selection);
  const effectiveMarket = norm.market;
  const effectiveSelection = norm.selection;
  const effectiveLine = line ?? norm.line;

  const total = home + away;

  if (effectiveMarket === "dnb") {
    if (home === away) return "void";
    if (effectiveSelection === "home") return home > away ? "won" : "lost";
    if (effectiveSelection === "away") return away > home ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "totals" && effectiveLine !== undefined) {
    if (total === effectiveLine) return "void";
  }

  if (effectiveMarket === "team_totals" && effectiveLine !== undefined) {
    if (effectiveSelection.startsWith("home_") && home === effectiveLine) return "void";
    if (effectiveSelection.startsWith("away_") && away === effectiveLine) return "void";
  }

  if (effectiveMarket === "spreads" && effectiveLine !== undefined) {
    if (effectiveSelection.startsWith("home") && home + effectiveLine === away) return "void";
    if (effectiveSelection.startsWith("away") && away + effectiveLine === home) return "void";
  }

  const holds = selectionHolds(
    {
      market: asMarketKey(effectiveMarket),
      selection: effectiveSelection,
      line: effectiveLine,
    },
    home,
    away,
  );
  if (holds === null) return null;
  return holds ? "won" : "lost";
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function computeClvPct(userDecimal: number, fairOrClosingDecimal: number): number {
  if (!(userDecimal > 1 && fairOrClosingDecimal > 1)) return 0;
  const raw = (userDecimal / fairOrClosingDecimal - 1) * 100;
  return Math.max(-999, Math.min(999, round2(raw)));
}

export interface SettlementRunReport {
  checkedPending: number;
  settledSingles: number;
  settledParlays: number;
  updatedPartialParlays: number;
  emailed: number;
  closingOddsCaptured: number;
  skippedUnresolved: number;
}

export async function runPickSettlement(
  db: Db,
  mailer: Mailer,
  options: {
    now?: Date;
    snapshotsRoot?: string;
    historyRoot?: string;
    onSettled?: (pick: { userId: string; status: PickResult; pickLabel: string }) => Promise<void>;
  } = {},
): Promise<SettlementRunReport> {
  const now = options.now ?? new Date();
  const dataset = buildServerRawPlatformDataset();

  const closingOddsCaptured = await syncPreKickoffClosingOdds(db, dataset, now).catch(() => 0);
  const scores = loadFinalMatchScores(options.snapshotsRoot, options.historyRoot);

  // Sincroniza match_results para el ranking de votos de «¿Quién gana?».
  const resultInputs = Array.from(scores.values()).map((s) => ({
    gameId: s.gameId,
    home: s.home,
    away: s.away,
  }));
  if (resultInputs.length > 0) {
    await recordMatchResults(db, resultInputs, now).catch(() => undefined);
  }

  const pending = await db
    .select()
    .from(sealedPicks)
    .where(and(eq(sealedPicks.status, "pending"), lte(sealedPicks.kickoffAt, now)));

  if (pending.length === 0) {
    return {
      checkedPending: 0,
      settledSingles: 0,
      settledParlays: 0,
      updatedPartialParlays: 0,
      emailed: 0,
      closingOddsCaptured,
      skippedUnresolved: 0,
    };
  }

  const allGameIds = new Set<string>();
  for (const row of pending) {
    allGameIds.add(row.gameId);
    if (Array.isArray(row.parlayLegs)) {
      for (const leg of row.parlayLegs) {
        if (leg?.gameId) allGameIds.add(leg.gameId);
      }
    }
  }
  const closingRows: ClosingOddsRow[] = await listClosingOddsForGames(db, Array.from(allGameIds));
  const gamesById = new Map(dataset.games.map((g) => [g.id, g]));

  let settledSingles = 0;
  let settledParlays = 0;
  let updatedPartialParlays = 0;
  let emailed = 0;
  let skippedUnresolved = 0;

  for (const row of pending) {
    if (row.pickKind === "parlay" && Array.isArray(row.parlayLegs) && row.parlayLegs.length >= 2) {
      const legs = row.parlayLegs as SealedParlayLegSpec[];
      const prevResults = new Map(
        ((row.parlayLegResults as SealedParlayLegResult[] | null) ?? []).map((r) => [r.pickId, r]),
      );
      const nextResults: SealedParlayLegResult[] = [];
      let anyLost = false;
      let allGraded = true;

      for (const leg of legs) {
        const cached = prevResults.get(leg.pickId);
        if (cached) {
          nextResults.push(cached);
          if (cached.status === "lost") anyLost = true;
          continue;
        }
        const score = scores.get(leg.gameId);
        if (!score) {
          allGraded = false;
          continue;
        }
        const legOutcome = gradeSelection(
          { market: leg.market, selection: leg.selection, line: leg.line, pickLabel: leg.pickLabel },
          score.home,
          score.away,
        );
        if (!legOutcome) {
          allGraded = false;
          continue;
        }
        const closing = findClosingQuoteForPick(closingRows, {
          gameId: leg.gameId,
          market: leg.market,
          selection: leg.selection,
          line: leg.line,
        });
        const legClosingRef = closing ? (closing.fairDecimal ?? closing.decimalOdds) : null;
        const legClv = legClosingRef ? computeClvPct(leg.fairDecimal, legClosingRef) : null;
        nextResults.push({
          pickId: leg.pickId,
          gameId: leg.gameId,
          status: legOutcome,
          homeScore: score.home,
          awayScore: score.away,
          closingDecimal: legClosingRef,
          clvPct: legClv,
          settledAt: now.toISOString(),
        });
        if (legOutcome === "lost") anyLost = true;
      }

      const finalStatus: PickResult | null = anyLost
        ? "lost"
        : allGraded
          ? nextResults.every((r) => r.status === "void")
            ? "void"
            : "won"
          : null;

      if (!finalStatus) {
        if (nextResults.length > prevResults.size) {
          await db
            .update(sealedPicks)
            .set({ parlayLegResults: nextResults })
            .where(and(eq(sealedPicks.id, row.id), eq(sealedPicks.status, "pending")));
          updatedPartialParlays += 1;
        } else {
          skippedUnresolved += 1;
        }
        continue;
      }

      // Calcular closingDecimal combinado solo si todas las piernas activas tienen cierre real.
      const activeLegs = legs.filter((l) => nextResults.find((r) => r.pickId === l.pickId)?.status !== "void");
      const allLegsHaveClosing =
        activeLegs.length > 0 &&
        activeLegs.every((l) => nextResults.find((r) => r.pickId === l.pickId)?.closingDecimal != null);
      const closingDecimal = allLegsHaveClosing
        ? Number(
            activeLegs
              .reduce((acc, l) => acc * (nextResults.find((r) => r.pickId === l.pickId)!.closingDecimal ?? 1), 1)
              .toFixed(3),
          )
        : null;

      const userDec = Number(row.userDecimal);
      const refFair = closingDecimal ?? Number(row.fairDecimal);
      const clvPct = computeClvPct(userDec, refFair);

      const res = await settleAndNotify(db, mailer, {
        userId: row.userId,
        pickId: row.pickId,
        result: finalStatus,
        clvPct,
        closingDecimal,
        parlayLegResults: nextResults,
        now,
      });
      if (res.settled) {
        settledParlays += 1;
        if (res.notice === "enviado") emailed += 1;
        if (options.onSettled) {
          await options.onSettled({ userId: row.userId, status: finalStatus, pickLabel: row.pickLabel }).catch(() => undefined);
        }
      }
      continue;
    }

    // Pick individual
    const score = scores.get(row.gameId);
    if (!score) {
      skippedUnresolved += 1;
      continue;
    }

    let market = row.pickMarket;
    let selection = row.pickSelection;
    let line = row.pickLine !== null && row.pickLine !== undefined ? Number(row.pickLine) : null;

    if (!market || !selection) {
      const catGame = gamesById.get(row.gameId);
      const catPick = catGame?.picks.find((p) => p.id === row.pickId || p.label === row.pickLabel);
      if (catPick) {
        market = catPick.market ?? market;
        selection = catPick.selectionKey;
        line = catPick.line ?? line;
      } else {
        const catRow = catGame?.markets.find((m) => m.label === row.pickLabel);
        if (catRow) {
          market = catRow.market;
          selection = catRow.selection;
          line = catRow.line ?? line;
        }
      }
    }

    const result = gradeSelection(
      { market, selection, line, pickLabel: row.pickLabel },
      score.home,
      score.away,
    );
    if (!result) {
      skippedUnresolved += 1;
      continue;
    }

    const closing = findClosingQuoteForPick(closingRows, {
      gameId: row.gameId,
      market,
      selection,
      line,
    });
    const closingRef = closing ? (closing.fairDecimal ?? closing.decimalOdds) : null;
    const clvPct = computeClvPct(Number(row.userDecimal), closingRef ?? Number(row.fairDecimal));

    const res = await settleAndNotify(db, mailer, {
      userId: row.userId,
      pickId: row.pickId,
      result,
      clvPct,
      closingDecimal: closingRef,
      now,
    });
    if (res.settled) {
      settledSingles += 1;
      if (res.notice === "enviado") emailed += 1;
      if (options.onSettled) {
        await options.onSettled({ userId: row.userId, status: result, pickLabel: row.pickLabel }).catch(() => undefined);
      }
    }
  }

  return {
    checkedPending: pending.length,
    settledSingles,
    settledParlays,
    updatedPartialParlays,
    emailed,
    closingOddsCaptured,
    skippedUnresolved,
  };
}
