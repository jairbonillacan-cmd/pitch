/**
 * Captura y consulta de cuotas de cierre pre-kickoff para el cálculo real de CLV.
 */
import { listClosingOddsForGames, upsertClosingOdds, type ClosingOddsInput, type ClosingOddsRow, type Db } from "@pitchlab/db";
import type { PlatformDataset } from "@pitchlab/ui/platform";
import { buildServerRawPlatformDataset } from "./platform-data";
import { findGameKickoff } from "./game-kickoff";

export function normalizeClosingMarketKey(market: string): string {
  const m = market.trim().toLowerCase();
  if (m === "1x2" || m === "moneyline" || m === "h2h") return "h2h";
  if (m.startsWith("totals_") || m === "totals" || m === "ou") return "totals";
  if (m === "spread" || m === "spreads" || m === "handicap" || m === "asian_handicap" || m === "puck_line") {
    return "spreads";
  }
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  return m;
}

export function normalizeClosingSelectionAndLine(
  market: string,
  selection: string,
  line?: number | null,
): { market: string; selection: string; lineKey: string } {
  const normMarket = normalizeClosingMarketKey(market);
  let normSel = selection.trim().toLowerCase();
  let resolvedLine = typeof line === "number" && Number.isFinite(line) ? line : null;

  if (normMarket === "totals") {
    const match = /^(over|under)_([+-]?\d+(?:\.\d+)?)$/.exec(normSel);
    if (match) {
      normSel = match[1]!;
      if (resolvedLine === null) resolvedLine = Number(match[2]);
    }
  } else if (normMarket === "spreads") {
    const match = /^(home|away)_([+-]?\d+(?:\.\d+)?)$/.exec(normSel);
    if (match) {
      normSel = match[1]!;
      if (resolvedLine === null) resolvedLine = Number(match[2]);
    }
  }

  const lineKey = resolvedLine !== null && Number.isFinite(resolvedLine) ? String(resolvedLine) : "";
  return { market: normMarket, selection: normSel, lineKey };
}

/** Extrae cuotas reales pre-kickoff del catálogo enriquecido del servidor. */
export function collectPreKickoffClosingOdds(dataset: PlatformDataset = buildServerRawPlatformDataset()): ClosingOddsInput[] {
  const rows: ClosingOddsInput[] = [];

  for (const game of dataset.games) {
    const kickoffAt = findGameKickoff(game.id) ?? (Date.parse(game.kickoffUtc) ? new Date(game.kickoffUtc) : null);
    if (!kickoffAt || Number.isNaN(kickoffAt.getTime())) continue;

    const mkt = game.spacetime?.market;
    if (!mkt?.asOfUtc) continue;
    const capturedAt = new Date(mkt.asOfUtc);
    if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > kickoffAt.getTime()) continue;

    const book = mkt.bookLabel.split(" · ")[0]?.trim() || "mercado";

    const pushH2h = (sel: "home" | "draw" | "away", dec: number | null | undefined, nv: number | undefined) => {
      if (typeof dec !== "number" || !Number.isFinite(dec) || dec < 1.01) return;
      const validNv = typeof nv === "number" && nv > 0 && nv < 1 ? nv : null;
      rows.push({
        gameId: game.id,
        market: "h2h",
        selection: sel,
        lineKey: "",
        book,
        decimalOdds: dec,
        fairDecimal: validNv ? 1 / validNv : null,
        noVigProb: validNv,
        source: "spacetime_snapshot",
        kickoffAt,
        capturedAt,
      });
    };

    pushH2h("home", mkt.odds.home, mkt.noVig.home);
    pushH2h("away", mkt.odds.away, mkt.noVig.away);
    if (mkt.odds.draw !== null) {
      pushH2h("draw", mkt.odds.draw, mkt.noVig.draw);
    }

    for (const row of game.markets) {
      if (typeof row.currentDecimal !== "number" || !Number.isFinite(row.currentDecimal) || row.currentDecimal < 1.01) {
        continue;
      }
      const key = normalizeClosingSelectionAndLine(row.market, row.selection, row.line);
      // Para h2h preferimos las filas sin vig ya calculadas arriba.
      if (key.market === "h2h") continue;
      rows.push({
        gameId: game.id,
        market: key.market,
        selection: key.selection,
        lineKey: key.lineKey,
        book,
        decimalOdds: row.currentDecimal,
        fairDecimal: row.fairDecimal >= 1.01 ? row.fairDecimal : null,
        noVigProb: row.p > 0 && row.p < 1 ? row.p : null,
        source: "spacetime_markets",
        kickoffAt,
        capturedAt,
      });
    }
  }

  return rows;
}

export async function syncPreKickoffClosingOdds(
  db: Db,
  dataset: PlatformDataset = buildServerRawPlatformDataset(),
  now: Date = new Date(),
): Promise<number> {
  const candidates = collectPreKickoffClosingOdds(dataset);
  return upsertClosingOdds(db, candidates, now);
}

export function findClosingQuoteForPick(
  rows: readonly ClosingOddsRow[],
  input: { gameId: string; market?: string | null; selection?: string | null; line?: number | null },
): ClosingOddsRow | null {
  if (!input.market || !input.selection) return null;
  const key = normalizeClosingSelectionAndLine(input.market, input.selection, input.line);
  return (
    rows.find(
      (r) =>
        r.gameId === input.gameId &&
        r.market === key.market &&
        r.selection === key.selection &&
        r.lineKey === key.lineKey,
    ) ?? null
  );
}
