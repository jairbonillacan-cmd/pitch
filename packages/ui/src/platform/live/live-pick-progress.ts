/**
 * Progreso en vivo de picks abiertos del socio (cero peticiones extra: consume el marcador
 * y las estadísticas en vivo ya sincronizados por `/api/live/*`).
 */
import {
  canonicalGameHref,
  isLivePhaseActive,
  type LiveMatchDetail,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import type { JournalEntry, PlatformGame } from "../types";

export interface LivePickProgressItem {
  readonly entryId: string;
  readonly gameId: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly clockLabel: string;
  readonly scoreLabel: string;
  readonly statusText: string;
  /** Lectura compacta `actual / línea` (ej. `2 / 2.5 goles` o `+1.0 margen`). */
  readonly progressRatioLabel?: string;
  /** `true` cuando un mercado Over ya cruzó su línea en vivo (provisional hasta FT). */
  readonly lineReached?: boolean;
  readonly currentValue: number | null;
  readonly targetValue: number | null;
  readonly tone: "brand" | "success" | "warning";
  readonly href?: string;
}

export type AsianHandicapLiveState =
  | "covering_full"
  | "covering_half"
  | "push"
  | "losing_half"
  | "not_covering";

/**
 * Evalúa un hándicap asiático o spread (incluyendo cuartos `.0`, `.25`, `.5`, `.75`)
 * respecto al margen actual `(equipo elegido − rival)`.
 */
export function evaluateAsianHandicapLive(
  teamMargin: number,
  handicapLine: number,
): { state: AsianHandicapLiveState; label: string; tone: "brand" | "success" | "warning" } {
  const adjusted = Math.round((teamMargin + handicapLine) * 100) / 100;
  if (adjusted >= 0.5) {
    return { state: "covering_full", label: "Cubriendo completo", tone: "success" };
  }
  if (adjusted > 0 && adjusted < 0.5) {
    return { state: "covering_half", label: "Media ganancia parcial", tone: "success" };
  }
  if (adjusted === 0) {
    return { state: "push", label: "Empate en línea (push)", tone: "brand" };
  }
  if (adjusted < 0 && adjusted > -0.5) {
    return { state: "losing_half", label: "Media pérdida parcial", tone: "warning" };
  }
  return { state: "not_covering", label: "Por debajo de la línea", tone: "warning" };
}

function parseHandicapTarget(
  label: string,
  game?: PlatformGame,
): { side: "home" | "away"; line: number } | null {
  const m = /([+-]\d+(?:\.(?:0|25|5|75))?)\b/.exec(label);
  if (!m?.[1]) return null;
  const line = Number(m[1]);
  if (!Number.isFinite(line)) return null;
  const lower = label.toLowerCase();
  if (lower.includes("local") || (game && lower.includes(game.home.shortName.toLowerCase()))) {
    return { side: "home", line };
  }
  if (lower.includes("visit") || (game && lower.includes(game.away.shortName.toLowerCase()))) {
    return { side: "away", line };
  }
  return null;
}

function parseThresholdTarget(label: string): {
  direction: "over" | "under";
  line: number;
  metric: "goals" | "corners" | "cards" | "shots" | "sot";
} | null {
  const lower = label.toLowerCase();
  const isOver = lower.includes("más de") || lower.startsWith("más ") || lower.includes("over ");
  const isUnder = lower.includes("menos de") || lower.startsWith("menos ") || lower.includes("under ");
  if (!isOver && !isUnder) return null;

  const numMatch = /(\d+(?:\.\d+)?)/.exec(lower);
  if (!numMatch?.[1]) return null;
  const line = Number(numMatch[1]);
  if (!Number.isFinite(line) || line <= 0) return null;

  let metric: "goals" | "corners" | "cards" | "shots" | "sot" = "goals";
  if (lower.includes("córner") || lower.includes("corner") || lower.includes("esquina")) {
    metric = "corners";
  } else if (lower.includes("tarjeta") || lower.includes("amarilla") || lower.includes("card")) {
    metric = "cards";
  } else if (lower.includes("arco") || lower.includes("puerta")) {
    metric = "sot";
  } else if (lower.includes("tiro") || lower.includes("disparo")) {
    metric = "shots";
  }

  return {
    direction: isOver ? "over" : "under",
    line,
    metric,
  };
}

export function computeLivePickProgress(params: {
  readonly entry: JournalEntry;
  readonly game?: PlatformGame;
  readonly scoreboardEntry?: LiveScoreboardEntry;
  readonly detail?: LiveMatchDetail | null;
}): LivePickProgressItem | null {
  const { entry, game, scoreboardEntry, detail } = params;
  if (entry.status !== "pending") return null;

  const isLiveByBoard = scoreboardEntry ? isLivePhaseActive(scoreboardEntry.phase) : false;
  const isLiveByGame = game?.status === "LIVE";
  if (!isLiveByBoard && !isLiveByGame) return null;

  const score = scoreboardEntry?.score ?? detail?.entry.score ?? game?.score ?? null;
  if (!score) return null;

  const clockRaw =
    scoreboardEntry?.clock ??
    detail?.entry.clock ??
    (scoreboardEntry?.phase === "halftime" ? "MT" : "En vivo");
  const clockLabel = /^\d/.test(clockRaw) && !clockRaw.endsWith("'") ? `${clockRaw}'` : clockRaw;
  const scoreLabel = `${score.home}–${score.away}`;
  const href = game ? canonicalGameHref(game.league, game) : undefined;

  const stats = detail?.stats ?? null;
  const parsedTotal = parseThresholdTarget(entry.pickLabel);

  if (parsedTotal) {
    let currentMetric: number | null = null;
    let unitSingular = "gol";
    let unitWord = "goles";
    if (parsedTotal.metric === "goals") {
      currentMetric = score.home + score.away;
      const isNonFootball = Boolean(game?.sport && game.sport !== "football");
      unitSingular = isNonFootball ? "pt" : "gol";
      unitWord = isNonFootball ? "pts" : "goles";
    } else if (parsedTotal.metric === "corners" && stats) {
      if (stats.home.corners !== null && stats.away.corners !== null) {
        currentMetric = stats.home.corners + stats.away.corners;
        unitSingular = "córner";
        unitWord = "córners";
      }
    } else if (parsedTotal.metric === "cards" && stats) {
      if (stats.home.yellowCards !== null && stats.away.yellowCards !== null) {
        currentMetric = stats.home.yellowCards + stats.away.yellowCards;
        unitSingular = "tarjeta";
        unitWord = "tarjetas";
      }
    } else if (parsedTotal.metric === "sot" && stats) {
      if (stats.home.shotsOnTarget !== null && stats.away.shotsOnTarget !== null) {
        currentMetric = stats.home.shotsOnTarget + stats.away.shotsOnTarget;
        unitSingular = "tiro a puerta";
        unitWord = "tiros a puerta";
      }
    } else if (parsedTotal.metric === "shots" && stats) {
      if (stats.home.shots !== null && stats.away.shots !== null) {
        currentMetric = stats.home.shots + stats.away.shots;
        unitSingular = "tiro";
        unitWord = "tiros";
      }
    }

    if (currentMetric !== null) {
      const ratioLabel = `${currentMetric} / ${parsedTotal.line} ${unitWord}`;
      if (parsedTotal.direction === "over") {
        const needed = Math.floor(parsedTotal.line) + 1;
        const met = currentMetric >= needed;
        const remaining = needed - currentMetric;
        return {
          entryId: entry.id,
          gameId: entry.gameId,
          leagueLabel: entry.leagueLabel,
          matchLabel: entry.matchLabel,
          pickLabel: entry.pickLabel,
          clockLabel,
          scoreLabel,
          statusText: met
            ? `Línea cumplida (provisional hasta FT)`
            : remaining === 1
              ? `Falta 1 ${unitSingular}`
              : `Faltan ${remaining} ${unitWord}`,
          progressRatioLabel: ratioLabel,
          lineReached: met,
          currentValue: Math.min(currentMetric, needed),
          targetValue: needed,
          tone: met ? "success" : "brand",
          ...(href ? { href } : {}),
        };
      }
      const maxAllowed = Math.ceil(parsedTotal.line) - 1;
      const busted = currentMetric > maxAllowed;
      return {
        entryId: entry.id,
        gameId: entry.gameId,
        leagueLabel: entry.leagueLabel,
        matchLabel: entry.matchLabel,
        pickLabel: entry.pickLabel,
        clockLabel,
        scoreLabel,
        statusText: busted
          ? `Línea superada (${currentMetric} ${currentMetric === 1 ? unitSingular : unitWord})`
          : `Margen activo · máx. ${maxAllowed} ${maxAllowed === 1 ? unitSingular : unitWord}`,
        progressRatioLabel: ratioLabel,
        lineReached: false,
        currentValue: Math.min(currentMetric, Math.max(1, maxAllowed + 1)),
        targetValue: Math.max(1, maxAllowed + 1),
        tone: busted ? "warning" : "brand",
        ...(href ? { href } : {}),
      };
    }
  }

  const parsedHandicap = parseHandicapTarget(entry.pickLabel, game);
  if (parsedHandicap) {
    const teamMargin =
      parsedHandicap.side === "home" ? score.home - score.away : score.away - score.home;
    const hcp = evaluateAsianHandicapLive(teamMargin, parsedHandicap.line);
    const marginText = teamMargin > 0 ? `+${teamMargin}` : `${teamMargin}`;
    const lineText = parsedHandicap.line > 0 ? `+${parsedHandicap.line}` : `${parsedHandicap.line}`;
    return {
      entryId: entry.id,
      gameId: entry.gameId,
      leagueLabel: entry.leagueLabel,
      matchLabel: entry.matchLabel,
      pickLabel: entry.pickLabel,
      clockLabel,
      scoreLabel,
      statusText: hcp.label,
      progressRatioLabel: `Margen ${marginText} vs ${lineText}`,
      lineReached: hcp.state === "covering_full",
      currentValue: null,
      targetValue: null,
      tone: hcp.tone,
      ...(href ? { href } : {}),
    };
  }

  const lower = entry.pickLabel.toLowerCase();
  if (lower.includes("ambos anotan")) {
    const wantsYes = !lower.includes("no");
    const scoredTeams = (score.home > 0 ? 1 : 0) + (score.away > 0 ? 1 : 0);
    if (wantsYes) {
      const met = scoredTeams === 2;
      return {
        entryId: entry.id,
        gameId: entry.gameId,
        leagueLabel: entry.leagueLabel,
        matchLabel: entry.matchLabel,
        pickLabel: entry.pickLabel,
        clockLabel,
        scoreLabel,
        statusText: met ? "Ambos equipos ya anotaron" : `${scoredTeams} de 2 equipos con gol`,
        progressRatioLabel: `${scoredTeams} / 2 equipos`,
        lineReached: met,
        currentValue: scoredTeams,
        targetValue: 2,
        tone: met ? "success" : "brand",
        ...(href ? { href } : {}),
      };
    }
  }

  return {
    entryId: entry.id,
    gameId: entry.gameId,
    leagueLabel: entry.leagueLabel,
    matchLabel: entry.matchLabel,
    pickLabel: entry.pickLabel,
    clockLabel,
    scoreLabel,
    statusText: `Marcador parcial ${scoreLabel}`,
    currentValue: null,
    targetValue: null,
    tone: "brand",
    ...(href ? { href } : {}),
  };
}
