/**
 * Despachador programado de alertas Web Push (RFC 8291 + VAPID):
 * 1) Partidos seguidos que arrancan en la ventana de 45–75 min (aviso 1 h antes).
 * 2) Movimientos fuertes de línea (≥ 5 % respecto a apertura) en partidos próximos con valor real.
 *
 * Incluye deduplicación en `live_feed_cache` para evitar reenvíos repetidos en ejecuciones consecutivas.
 */
import { canonicalGameHref } from "@pitchlab/contracts";
import {
  listLiveGameWatchers,
  listPushAlertRecipients,
  readLiveCache,
  writeLiveCache,
  type Db,
} from "@pitchlab/db";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/platform";
import { buildServerRawPlatformDataset } from "./platform-data";
import { isWebPushConfigured, sendPushToUsers } from "./web-push";

const PREMATCH_MIN_MS = 45 * 60_000;
const PREMATCH_MAX_MS = 75 * 60_000;
const LINE_MOVE_MIN_RATIO = 0.05;
const DEDUPE_TTL_MS = 6 * 3_600_000;

export interface DetectedLineMoveAlert {
  game: PlatformGame;
  label: string;
  selection: string;
  openDecimal: number;
  currentDecimal: number;
  shiftPct: number;
  bookLabel: string;
  edgePts: number | null;
}

export interface PushAlertsRunReport {
  configured: boolean;
  prematchGamesChecked: number;
  prematchPushesSent: number;
  lineMovesDetected: number;
  lineMovePushesSent: number;
  prunedSubscriptions: number;
}

/**
 * Encuentra partidos próximos con movimiento real de línea ≥ 5 % respecto a la cuota de apertura
 * (con ventaja del modelo o acortamiento claro en una casa verificada).
 */
export function detectSignificantLineMoves(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
  minShiftRatio: number = LINE_MOVE_MIN_RATIO,
): DetectedLineMoveAlert[] {
  const alerts: DetectedLineMoveAlert[] = [];
  const horizonMs = nowMs + 48 * 3_600_000;

  for (const game of dataset.games) {
    if (game.status !== "NS") continue;
    const kickoffMs = Date.parse(game.kickoffUtc);
    if (!Number.isFinite(kickoffMs) || kickoffMs <= nowMs || kickoffMs > horizonMs) continue;

    let bestForGame: DetectedLineMoveAlert | null = null;
    for (const row of game.markets) {
      if (
        typeof row.openDecimal !== "number" ||
        typeof row.currentDecimal !== "number" ||
        !(row.openDecimal > 1.01) ||
        !(row.currentDecimal > 1.01)
      ) {
        continue;
      }
      const openProb = 1 / row.openDecimal;
      const currentProb = 1 / row.currentDecimal;
      const relativeShift = Math.abs(row.currentDecimal - row.openDecimal) / row.openDecimal;
      const probShift = Math.abs(currentProb - openProb);
      if (relativeShift < minShiftRatio && probShift < minShiftRatio) continue;
      const shiftPct = Math.round(relativeShift * 1000) / 10;
      const edgePts =
        typeof row.edgePts === "number"
          ? row.edgePts
          : Math.round((row.p - 1 / row.currentDecimal) * 1000) / 10;
      // Solo avisamos movimientos con valor positivo o acortamiento significativo (dinero hacia la selección).
      if (edgePts < 1.5 && row.movementDirection !== "shortening") continue;

      const candidate: DetectedLineMoveAlert = {
        game,
        label: row.label,
        selection: `${row.market}:${row.selection}`,
        openDecimal: row.openDecimal,
        currentDecimal: row.currentDecimal,
        shiftPct,
        bookLabel: row.quoteBookLabel ?? row.bookQuotes?.[0]?.bookLabel ?? "Mercado",
        edgePts,
      };
      if (!bestForGame || candidate.shiftPct > bestForGame.shiftPct) {
        bestForGame = candidate;
      }
    }
    if (bestForGame) alerts.push(bestForGame);
  }

  return alerts.sort((a, b) => b.shiftPct - a.shiftPct).slice(0, 12);
}

/** Partidos que inician dentro de la ventana de aviso previo (45 a 75 min antes del saque). */
export function findPreMatchPushGames(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
): PlatformGame[] {
  return dataset.games.filter((game) => {
    if (game.status !== "NS") return false;
    const kickoffMs = Date.parse(game.kickoffUtc);
    if (!Number.isFinite(kickoffMs)) return false;
    const delta = kickoffMs - nowMs;
    return delta >= PREMATCH_MIN_MS && delta <= PREMATCH_MAX_MS;
  });
}

async function claimAlertOnce(db: Db, cacheKey: string, now: Date): Promise<boolean> {
  try {
    const existing = await readLiveCache(db, cacheKey, now);
    if (existing?.fresh) return false;
    await writeLiveCache(db, cacheKey, { sentAt: now.toISOString() }, now, DEDUPE_TTL_MS);
    return true;
  } catch (err) {
    void err;
    return true;
  }
}

export async function runScheduledPushAlerts(
  db: Db,
  options: {
    now?: Date;
    dataset?: PlatformDataset;
    fetchImpl?: typeof fetch;
    forceConfiguredCheck?: boolean;
  } = {},
): Promise<PushAlertsRunReport> {
  const now = options.now ?? new Date();
  const configured = options.forceConfiguredCheck ?? isWebPushConfigured();
  if (!configured) {
    return {
      configured: false,
      prematchGamesChecked: 0,
      prematchPushesSent: 0,
      lineMovesDetected: 0,
      lineMovePushesSent: 0,
      prunedSubscriptions: 0,
    };
  }

  const dataset = options.dataset ?? buildServerRawPlatformDataset();
  const prematchGames = findPreMatchPushGames(dataset, now.getTime());
  const lineMoves = detectSignificantLineMoves(dataset, now.getTime());

  let prematchPushesSent = 0;
  let lineMovePushesSent = 0;
  let prunedSubscriptions = 0;

  // 1) Alertas 60 min antes para usuarios que vigilan el partido
  if (prematchGames.length > 0) {
    const watchers = await listLiveGameWatchers(
      db,
      prematchGames.map((g) => g.id),
    );
    for (const game of prematchGames) {
      const userIds = watchers
        .filter((w) => w.gameId === game.id && w.kickoff)
        .map((w) => w.userId);
      if (userIds.length === 0) continue;
      const shouldSend = await claimAlertOnce(db, `push:prematch60:${game.id}`, now);
      if (!shouldSend) continue;

      const mainPick = game.picks[0];
      const href = canonicalGameHref(game.league, game);
      const res = await sendPushToUsers(
        db,
        userIds,
        "live",
        {
          title: `En 1 h: ${game.home.shortName} vs ${game.away.shortName}`,
          body: mainPick && !mainPick.isRedacted
            ? `Pick principal congelado: ${mainPick.label} (${Math.round(mainPick.p * 100)} %).`
            : `${game.leagueLabel} · Revisa bajas, árbitro y cuotas antes del inicio.`,
          url: href,
          tag: `prematch-60m-${game.id}`,
        },
        options.fetchImpl,
      );
      prematchPushesSent += res.sent;
      prunedSubscriptions += res.pruned;
    }
  }

  // 2) Alertas de movimiento de línea ≥ 5 % a favor del modelo
  if (lineMoves.length > 0) {
    const recipients = await listPushAlertRecipients(db, "picks");
    for (const move of lineMoves) {
      const homeKey = `${move.game.league}:${move.game.home.slug}`;
      const awayKey = `${move.game.league}:${move.game.away.slug}`;
      const targetUsers = recipients
        .filter((r) => {
          if (!r.lineMoveAlerts) return false;
          if (r.followedTeams.includes(homeKey) || r.followedTeams.includes(awayKey)) return true;
          if (r.favoriteLeagues.length === 0) return true;
          return r.favoriteLeagues.includes(move.game.league);
        })
        .map((r) => r.userId);
      if (targetUsers.length === 0) continue;

      const cacheKey = `push:linemove:${move.game.id}:${move.selection}:${move.currentDecimal.toFixed(2)}`;
      const shouldSend = await claimAlertOnce(db, cacheKey, now);
      if (!shouldSend) continue;

      const href = canonicalGameHref(move.game.league, move.game);
      const res = await sendPushToUsers(
        db,
        targetUsers,
        "picks",
        {
          title: `Movimiento ${move.shiftPct.toFixed(1)} % · ${move.game.home.shortName} vs ${move.game.away.shortName}`,
          body: `${move.label}: ${move.openDecimal.toFixed(2)} → ${move.currentDecimal.toFixed(2)} (${move.bookLabel}).`,
          url: href,
          tag: `line-move-${move.game.id}`,
        },
        options.fetchImpl,
      );
      lineMovePushesSent += res.sent;
      prunedSubscriptions += res.pruned;
    }
  }

  return {
    configured: true,
    prematchGamesChecked: prematchGames.length,
    prematchPushesSent,
    lineMovesDetected: lineMoves.length,
    lineMovePushesSent,
    prunedSubscriptions,
  };
}
