import { canonicalGameHref, type LeagueId, type PlatformSport } from "@pitchlab/contracts";
import { decimalToAmericanInt } from "../../access-guard";
import { evaluatePropLineProbability } from "../../match-picks-engine";
import { resolveMatchRefereeAnalytics, type RefereeAnalyticsItem } from "../../referee-stats";
import type { ConfirmedLineupPlayer, PlatformGame, PlayerPropItem } from "../../types";
import type {
  PlayerLineupSignalStatus,
  TeamDisciplinaryProfile,
  TeamPlayerPick,
  TeamProfileData,
  TeamRecentAverages,
  TeamRefereeContext,
  TeamSquadPlayer,
  TeamStandingSummary,
} from "./types";

export const FOOTBALL_MIN_MINUTES_GUARD = 45;
export const NBA_MIN_MINUTES_PER_GAME = 18;
export const MIN_SAMPLE_GUARD_LABEL = "Muestra ≥ 45 min";

export type NbaStructuredStatCode = "PTS" | "REB" | "AST" | "3PM";

export const NBA_STAT_CODE_ORDER: readonly NbaStructuredStatCode[] = [
  "PTS",
  "REB",
  "AST",
  "3PM",
];

export const NBA_STAT_FULL_LABEL: Readonly<Record<NbaStructuredStatCode, string>> = {
  PTS: "Puntos",
  REB: "Rebotes",
  AST: "Asistencias",
  "3PM": "Triples",
};

export interface ResolvedLineupSignal {
  readonly status: PlayerLineupSignalStatus;
  readonly label: string;
  readonly tone: "success" | "info" | "warning" | "danger" | "neutral";
  readonly formation?: string | null;
}

export interface PlayerMinutesGuardResult {
  readonly qualified: boolean;
  readonly avgMinutes: number | null;
  readonly qualifiedGames: number;
  readonly label: string;
  readonly detail: string | null;
}

export interface TeamRefereeMatchSummary {
  readonly analytics: RefereeAnalyticsItem;
  readonly matchLabel: string;
  readonly dayLabel: string;
  readonly gameHref: string;
  readonly isUpcoming: boolean;
  readonly projectedYellowTotal: number | null;
  readonly projectedFoulsTotal: number | null;
}

export function normalizePlayerMatchName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(candidateName: string, targetName: string): boolean {
  const a = normalizePlayerMatchName(candidateName);
  const b = normalizePlayerMatchName(targetName);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = a.split(" ");
  const bTokens = b.split(" ");
  const aLast = aTokens[aTokens.length - 1] ?? "";
  const bLast = bTokens[bTokens.length - 1] ?? "";
  if (aLast.length >= 5 && aLast === bLast) {
    const aFirst = aTokens[0]?.[0] ?? "";
    const bFirst = bTokens[0]?.[0] ?? "";
    if (!aFirst || !bFirst || aFirst === bFirst) return true;
  }
  return false;
}

function starterMatchesPlayer(
  starters: readonly ConfirmedLineupPlayer[],
  playerName: string,
): boolean {
  return starters.some((s) => namesMatch(s.name, playerName));
}

export function resolveNbaPropStatCode(statLabel: string): NbaStructuredStatCode | null {
  const norm = statLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (norm === "pts" || norm.includes("punto")) return "PTS";
  if (norm === "reb" || norm.includes("rebote")) return "REB";
  if (norm === "ast" || norm.includes("asistencia")) return "AST";
  if (norm === "3pm" || norm === "3pt" || norm.includes("triple")) return "3PM";
  return null;
}

export function parseNumericMetric(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "--") return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    const mins = Number(parts[0]);
    const secs = Number(parts[1] ?? "0");
    if (Number.isFinite(mins) && mins >= 0) {
      return mins + (Number.isFinite(secs) && secs >= 0 ? secs / 60 : 0);
    }
    return null;
  }
  if (trimmed.includes("/")) {
    const first = Number(trimmed.split("/")[0]);
    return Number.isFinite(first) && first >= 0 ? first : null;
  }
  const n = Number(trimmed.replace(/%$/, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseNbaMetricValue(
  player: Pick<TeamSquadPlayer, "seasonMetrics">,
  keys: readonly string[],
): string | null {
  const metrics = player.seasonMetrics;
  if (!metrics || metrics.length === 0) return null;
  const lowered = new Set(keys.map((k) => k.toLowerCase()));
  for (const m of metrics) {
    if (lowered.has(m.key.toLowerCase()) || lowered.has(m.label.toLowerCase())) {
      const clean = m.value.trim();
      if (clean && clean !== "-" && clean !== "—") return clean;
    }
  }
  return null;
}

function findTeamTargetGame(
  games: readonly PlatformGame[],
  league: LeagueId,
  teamSlug: string,
  preferredGameId?: string | null,
): { game: PlatformGame; teamSide: "home" | "away" } | null {
  const targetSlug = teamSlug.trim().toLowerCase();
  if (preferredGameId) {
    const exact = games.find((g) => g.id === preferredGameId);
    if (exact) {
      if (exact.home.slug.toLowerCase() === targetSlug) return { game: exact, teamSide: "home" };
      if (exact.away.slug.toLowerCase() === targetSlug) return { game: exact, teamSide: "away" };
    }
  }

  const upcoming = games.find(
    (g) =>
      g.league === league &&
      g.status !== "FT" &&
      (g.home.slug.toLowerCase() === targetSlug || g.away.slug.toLowerCase() === targetSlug),
  );
  if (upcoming) {
    return {
      game: upcoming,
      teamSide: upcoming.home.slug.toLowerCase() === targetSlug ? "home" : "away",
    };
  }
  return null;
}

export function resolvePlayerLineupSignal(
  games: readonly PlatformGame[],
  params: {
    league: LeagueId;
    teamSlug: string;
    playerName: string;
    gameId?: string | null;
    sport?: PlatformSport;
    explicitStatus?: "confirmed" | "probable" | null;
  },
): ResolvedLineupSignal | null {
  const isFootball = (params.sport ?? "football") === "football";
  const confirmedLabel = isFootball ? "XI confirmado" : "Titular confirmado";
  const probableLabel = isFootball ? "XI probable" : "Titular probable";

  const found = findTeamTargetGame(games, params.league, params.teamSlug, params.gameId);
  if (found) {
    const { game, teamSide } = found;
    const pre = game.preGame;

    const abs = pre.absences.find(
      (item) => item.teamSide === teamSide && namesMatch(item.player, params.playerName),
    );
    if (abs) {
      if (abs.status === "Baja") {
        return { status: "ruled_out", label: "Descartado", tone: "danger" };
      }
      if (abs.status === "Duda") {
        return { status: "doubtful", label: "En duda", tone: "warning" };
      }
      if (abs.status === "Confirmado XI") {
        return {
          status: "confirmed",
          label: confirmedLabel,
          tone: "success",
          formation:
            teamSide === "home"
              ? (pre.confirmedLineups?.homeFormation ?? null)
              : (pre.confirmedLineups?.awayFormation ?? null),
        };
      }
    }

    const confirmed = pre.confirmedLineups;
    if (confirmed) {
      const starters = teamSide === "home" ? confirmed.homeStarters : confirmed.awayStarters;
      const formation = teamSide === "home" ? confirmed.homeFormation : confirmed.awayFormation;
      if (starters.length > 0) {
        if (starterMatchesPlayer(starters, params.playerName)) {
          return {
            status: "confirmed",
            label: confirmedLabel,
            tone: "success",
            formation: formation ?? null,
          };
        }
        if (pre.lineupsConfirmed60m) {
          return {
            status: "bench",
            label: "Banca confirmada",
            tone: "neutral",
            formation: formation ?? null,
          };
        }
      }
    }

    const probable = pre.probableLineups;
    if (probable) {
      const starters = teamSide === "home" ? probable.homeStarters : probable.awayStarters;
      const formation = teamSide === "home" ? probable.homeFormation : probable.awayFormation;
      if (starters.length > 0 && starterMatchesPlayer(starters, params.playerName)) {
        return {
          status: "probable",
          label: probableLabel,
          tone: "info",
          formation: formation ?? null,
        };
      }
    }
  }

  if (params.explicitStatus === "confirmed") {
    return { status: "confirmed", label: confirmedLabel, tone: "success" };
  }
  if (params.explicitStatus === "probable") {
    return { status: "probable", label: probableLabel, tone: "info" };
  }
  return null;
}

export function resolveTeamNextLineupMap(
  games: readonly PlatformGame[],
  league: LeagueId,
  teamSlug: string,
  sport: PlatformSport,
): {
  readonly status: "confirmed" | "probable" | null;
  readonly statusLabel: string | null;
  readonly formation: string | null;
  readonly byPlayerKey: ReadonlyMap<string, ResolvedLineupSignal>;
} {
  const byPlayerKey = new Map<string, ResolvedLineupSignal>();
  const found = findTeamTargetGame(games, league, teamSlug);
  if (!found) {
    return { status: null, statusLabel: null, formation: null, byPlayerKey };
  }
  const { game, teamSide } = found;
  const isFootball = sport === "football";
  const confirmed = game.preGame.confirmedLineups;
  const probable = game.preGame.probableLineups;

  if (confirmed) {
    const starters = teamSide === "home" ? confirmed.homeStarters : confirmed.awayStarters;
    const formation = (teamSide === "home" ? confirmed.homeFormation : confirmed.awayFormation) ?? null;
    if (starters.length > 0) {
      const label = isFootball ? "XI confirmado" : "Titular confirmado";
      for (const s of starters) {
        const key = normalizePlayerMatchName(s.name);
        if (key) {
          byPlayerKey.set(key, { status: "confirmed", label, tone: "success", formation });
        }
      }
      return {
        status: "confirmed",
        statusLabel: formation ? `${label} · ${formation}` : label,
        formation,
        byPlayerKey,
      };
    }
  }

  if (probable) {
    const starters = teamSide === "home" ? probable.homeStarters : probable.awayStarters;
    const formation = (teamSide === "home" ? probable.homeFormation : probable.awayFormation) ?? null;
    if (starters.length > 0) {
      const label = isFootball ? "XI probable" : "Titular probable";
      for (const s of starters) {
        const key = normalizePlayerMatchName(s.name);
        if (key) {
          byPlayerKey.set(key, { status: "probable", label, tone: "info", formation });
        }
      }
      return {
        status: "probable",
        statusLabel: formation ? `${label} · ${formation}` : label,
        formation,
        byPlayerKey,
      };
    }
  }

  return { status: null, statusLabel: null, formation: null, byPlayerKey };
}

export function evaluatePlayerMinutesGuard(
  player: Pick<TeamSquadPlayer, "stats" | "seasonMetrics" | "recentGames" | "avgMinutes" | "minMinutesGuard">,
  sport: PlatformSport,
): PlayerMinutesGuardResult {
  const recentLogs = player.recentGames ?? [];
  const logMinutes = recentLogs
    .map((g) => {
      const hit = g.stats.find((s) => {
        const lbl = s.label.trim().toLowerCase();
        return lbl === "min" || lbl === "mins" || lbl === "minutos";
      });
      return hit ? parseNumericMetric(hit.value) : null;
    })
    .filter((v): v is number => v !== null);

  const seasonMin = parseNumericMetric(parseNbaMetricValue(player, ["min", "minutes", "minutos"]));
  const seasonGp =
    parseNumericMetric(parseNbaMetricValue(player, ["gp", "jj", "pj", "g"])) ??
    player.stats.appearances;

  const avgFromLogs =
    logMinutes.length > 0
      ? Math.round((logMinutes.reduce((a, b) => a + b, 0) / logMinutes.length) * 10) / 10
      : null;
  const avgMinutes = player.avgMinutes ?? seasonMin ?? avgFromLogs;

  if (sport === "basketball") {
    const qualifiedLogsCount = logMinutes.filter((m) => m >= NBA_MIN_MINUTES_PER_GAME).length;
    const totalSampleMin =
      logMinutes.length > 0
        ? logMinutes.reduce((a, b) => a + b, 0)
        : avgMinutes != null && seasonGp > 0
          ? avgMinutes * seasonGp
          : 0;
    const qualified =
      player.minMinutesGuard === true ||
      (avgMinutes !== null &&
        avgMinutes >= NBA_MIN_MINUTES_PER_GAME &&
        (seasonGp >= 3 || qualifiedLogsCount >= 3) &&
        totalSampleMin >= FOOTBALL_MIN_MINUTES_GUARD);
    return {
      qualified,
      avgMinutes,
      qualifiedGames: Math.max(qualifiedLogsCount, Math.round(seasonGp)),
      label: qualified ? MIN_SAMPLE_GUARD_LABEL : "Muestra insuficiente",
      detail:
        avgMinutes !== null
          ? `Prom. ${avgMinutes.toFixed(1)} min/p · ${Math.max(logMinutes.length, Math.round(seasonGp))} JJ`
          : null,
    };
  }

  if (logMinutes.length > 0) {
    const qualifiedLogs = logMinutes.filter((m) => m >= FOOTBALL_MIN_MINUTES_GUARD);
    const qualified =
      player.minMinutesGuard === true ||
      qualifiedLogs.length >= 3 ||
      (avgMinutes !== null && avgMinutes >= FOOTBALL_MIN_MINUTES_GUARD && logMinutes.length >= 3);
    return {
      qualified,
      avgMinutes,
      qualifiedGames: qualifiedLogs.length,
      label: qualified ? MIN_SAMPLE_GUARD_LABEL : "Muestra insuficiente",
      detail:
        avgMinutes !== null
          ? `Prom. ${avgMinutes.toFixed(0)} min/p · ${qualifiedLogs.length} partidos ≥ 45 min`
          : null,
    };
  }

  const appearances = player.stats.appearances;
  const starts = Math.max(0, appearances - player.stats.subIns);
  const starterRatio = appearances > 0 ? starts / appearances : 0;
  const qualified =
    player.minMinutesGuard === true ||
    (appearances >= 3 && (starts >= 3 || starterRatio >= 0.5));
  return {
    qualified,
    avgMinutes,
    qualifiedGames: starts,
    label: qualified ? MIN_SAMPLE_GUARD_LABEL : "Muestra insuficiente",
    detail:
      appearances > 0
        ? `${starts} titularidades en ${appearances} apariciones`
        : null,
  };
}

function halfPointLine(mean: number, isPoints: boolean): number {
  if (isPoints) {
    return Math.max(4.5, Math.floor(mean) - 0.5);
  }
  if (mean >= 4) {
    return Math.max(0.5, Math.floor(mean) - 0.5);
  }
  return Math.max(0.5, Math.floor(mean) + 0.5);
}

/**
 * Construye props estructurados NBA (`PTS`, `REB`, `AST`, `3PM`) ligados a `fairOdds`
 * y proyección Spacetime a partir de datos verificados del jugador y del catálogo activo.
 * Nunca fabrica estadísticas ausentes ni emite líneas para jugadores en baja.
 */
export function deriveStructuredNbaPlayerPicks(params: {
  player: TeamSquadPlayer;
  league: LeagueId;
  teamSlug: string;
  teamName: string;
  nextOpponent?: string | null;
  datasetProps?: readonly PlayerPropItem[];
  lineupSignal?: ResolvedLineupSignal | null;
}): TeamPlayerPick[] {
  const { player, teamSlug, nextOpponent, datasetProps, lineupSignal } = params;
  if (
    player.availability === "injured" ||
    player.availability === "suspended" ||
    lineupSignal?.status === "ruled_out"
  ) {
    return [];
  }

  const guard = evaluatePlayerMinutesGuard(player, "basketball");
  if (!guard.qualified) return [];

  const byCode = new Map<NbaStructuredStatCode, TeamPlayerPick>();
  const normPlayer = normalizePlayerMatchName(player.name);
  const normTeam = teamSlug.trim().toLowerCase();

  for (const pp of datasetProps ?? []) {
    if (pp.league !== params.league) continue;
    if (pp.teamSlug.trim().toLowerCase() !== normTeam) continue;
    if (!namesMatch(pp.player, normPlayer)) continue;
    const code = resolveNbaPropStatCode(pp.statLabel);
    if (!code || byCode.has(code)) continue;
    const ev = evaluatePropLineProbability(pp.projectionMean, pp.projectionSd, pp.baseLine);
    byCode.set(code, {
      id: `${player.slug}-nba-${code.toLowerCase()}-${pp.baseLine.toFixed(1)}`,
      marketKey: `nba_player_${code.toLowerCase()}`,
      marketLabel: `${NBA_STAT_FULL_LABEL[code]} (${code})`,
      selectionLabel: `Más de ${pp.baseLine.toFixed(1)} ${NBA_STAT_FULL_LABEL[code].toLowerCase()}`,
      locked: false,
      line: pp.baseLine,
      projectionMean: pp.projectionMean,
      projectionSd: pp.projectionSd,
      p: ev.pOver,
      fairDecimal: ev.fairOverDecimal,
      fairAmerican: decimalToAmericanInt(ev.fairOverDecimal),
      rationale: pp.contextNote,
      statCode: code,
      minMinutesGuard: true,
      avgMinutes: guard.avgMinutes,
      sampleGames: pp.last10.length > 0 ? pp.last10.length : guard.qualifiedGames,
      lineupStatus:
        lineupSignal?.status === "confirmed" || lineupSignal?.status === "probable"
          ? lineupSignal.status
          : null,
    });
  }

  const metricDefs: ReadonlyArray<{
    code: NbaStructuredStatCode;
    keys: readonly string[];
    minThreshold: number;
    sdFactor: number;
    minSd: number;
  }> = [
    { code: "PTS", keys: ["pts", "puntos"], minThreshold: 6, sdFactor: 0.28, minSd: 3.2 },
    { code: "REB", keys: ["reb", "rebotes"], minThreshold: 2.5, sdFactor: 0.34, minSd: 1.4 },
    { code: "AST", keys: ["ast", "asistencias"], minThreshold: 2.0, sdFactor: 0.36, minSd: 1.2 },
    { code: "3PM", keys: ["3pm", "tpm", "triples"], minThreshold: 1.0, sdFactor: 0.45, minSd: 0.9 },
  ];

  for (const def of metricDefs) {
    if (byCode.has(def.code)) continue;
    const meanRaw = parseNumericMetric(parseNbaMetricValue(player, def.keys));
    if (meanRaw === null || meanRaw < def.minThreshold) continue;

    const logVals = (player.recentGames ?? [])
      .map((g) => {
        const hit = g.stats.find((s) => resolveNbaPropStatCode(s.label) === def.code);
        return hit ? parseNumericMetric(hit.value) : null;
      })
      .filter((v): v is number => v !== null);

    let mean = meanRaw;
    let sd = Math.max(def.minSd, Math.round(meanRaw * def.sdFactor * 100) / 100);
    if (logVals.length >= 3) {
      const logAvg = logVals.reduce((a, b) => a + b, 0) / logVals.length;
      mean = Math.round((meanRaw * 0.65 + logAvg * 0.35) * 100) / 100;
      const variance =
        logVals.reduce((acc, v) => acc + (v - logAvg) ** 2, 0) / logVals.length;
      sd = Math.max(def.minSd, Math.round(Math.sqrt(variance) * 100) / 100);
    }

    const line = halfPointLine(mean, def.code === "PTS");
    const ev = evaluatePropLineProbability(mean, sd, line);
    const minNote = guard.avgMinutes != null ? ` · ${guard.avgMinutes.toFixed(1)} min/p` : "";
    const rivalNote = nextOpponent ? ` frente a ${nextOpponent}` : "";
    byCode.set(def.code, {
      id: `${player.slug}-nba-${def.code.toLowerCase()}-${line.toFixed(1)}`,
      marketKey: `nba_player_${def.code.toLowerCase()}`,
      marketLabel: `${NBA_STAT_FULL_LABEL[def.code]} (${def.code})`,
      selectionLabel: `Más de ${line.toFixed(1)} ${NBA_STAT_FULL_LABEL[def.code].toLowerCase()}`,
      locked: false,
      line,
      projectionMean: mean,
      projectionSd: sd,
      p: ev.pOver,
      fairDecimal: ev.fairOverDecimal,
      fairAmerican: decimalToAmericanInt(ev.fairOverDecimal),
      rationale: `Promedio verificado ${meanRaw.toFixed(1)} ${def.code}${minNote}${rivalNote}.`,
      statCode: def.code,
      minMinutesGuard: true,
      avgMinutes: guard.avgMinutes,
      sampleGames: guard.qualifiedGames,
      lineupStatus:
        lineupSignal?.status === "confirmed" || lineupSignal?.status === "probable"
          ? lineupSignal.status
          : null,
    });
  }

  return NBA_STAT_CODE_ORDER.map((code) => byCode.get(code)).filter(
    (item): item is TeamPlayerPick => item !== undefined,
  );
}

/**
 * Calcula el perfil disciplinario real del equipo a partir de la plantilla verificada.
 * Devuelve `null` si no existen registros de tarjetas ni faltas en el corte actual.
 */
export function computeTeamDisciplinaryProfile(
  squad: TeamProfileData["squad"],
  standing: TeamStandingSummary | null,
  recentAverages: TeamRecentAverages,
): TeamDisciplinaryProfile | null {
  if (!squad || squad.players.length === 0) return null;

  let yellowCards = 0;
  let redCards = 0;
  let foulsCommitted = 0;
  let foulsSuffered = 0;
  let maxPlayerApps = 0;
  let topBooked: TeamDisciplinaryProfile["topBookedPlayer"] = null;

  for (const p of squad.players) {
    yellowCards += p.stats.yellowCards;
    redCards += p.stats.redCards;
    foulsCommitted += p.stats.foulsCommitted;
    foulsSuffered += p.stats.foulsSuffered;
    if (p.stats.appearances > maxPlayerApps) {
      maxPlayerApps = p.stats.appearances;
    }
    const weight = p.stats.yellowCards + p.stats.redCards * 2;
    const prevWeight = topBooked ? topBooked.yellowCards + topBooked.redCards * 2 : 0;
    if ((p.stats.yellowCards >= 2 || p.stats.redCards >= 1) && weight > prevWeight) {
      topBooked = {
        name: p.name,
        shortName: p.shortName,
        slug: p.slug,
        yellowCards: p.stats.yellowCards,
        redCards: p.stats.redCards,
      };
    }
  }

  if (yellowCards === 0 && redCards === 0 && foulsCommitted === 0 && foulsSuffered === 0) {
    return null;
  }

  const sampleGames = Math.max(
    standing?.played ?? 0,
    maxPlayerApps,
    recentAverages.sampleGames,
  );

  const perGame = (total: number): number | null =>
    sampleGames > 0 ? Math.round((total / sampleGames) * 100) / 100 : null;

  return {
    sampleGames,
    yellowCards,
    redCards,
    foulsCommitted,
    foulsSuffered,
    yellowPerGame: yellowCards > 0 || sampleGames > 0 ? perGame(yellowCards) : null,
    redPerGame: redCards > 0 || sampleGames > 0 ? perGame(redCards) : null,
    foulsCommittedPerGame: foulsCommitted > 0 ? perGame(foulsCommitted) : null,
    foulsSufferedPerGame: foulsSuffered > 0 ? perGame(foulsSuffered) : null,
    topBookedPlayer: topBooked,
  };
}

/**
 * Resuelve el contexto arbitral del próximo partido del equipo (o del más reciente con dato)
 * a partir de los partidos hidratados en `dataset.games` y el análisis bayesiano de árbitros.
 */
export function resolveTeamNextMatchReferee(
  games: readonly PlatformGame[],
  league: LeagueId,
  teamSlug: string,
  nextFixtureId?: string | null,
  fallbackContext?: TeamRefereeContext | null,
): TeamRefereeMatchSummary | null {
  const targetSlug = teamSlug.trim().toLowerCase();
  const teamGames = games.filter(
    (g) =>
      g.league === league &&
      (g.home.slug.toLowerCase() === targetSlug || g.away.slug.toLowerCase() === targetSlug),
  );

  const orderedCandidates: PlatformGame[] = [];
  if (nextFixtureId) {
    const exact = teamGames.find((g) => g.id === nextFixtureId);
    if (exact) orderedCandidates.push(exact);
  }
  for (const g of teamGames) {
    if (g.status !== "FT" && !orderedCandidates.some((c) => c.id === g.id)) {
      orderedCandidates.push(g);
    }
  }
  for (const g of teamGames) {
    if (g.status === "FT" && !orderedCandidates.some((c) => c.id === g.id)) {
      orderedCandidates.push(g);
    }
  }

  for (const game of orderedCandidates) {
    const analytics = resolveMatchRefereeAnalytics(game, games);
    if (!analytics) continue;
    return {
      analytics,
      matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
      dayLabel: `${game.dayLabel} · ${game.kickoffLocal}`,
      gameHref: canonicalGameHref(game.league, game),
      isUpcoming: game.status !== "FT",
      projectedYellowTotal:
        game.counts?.yellow && Number.isFinite(game.counts.yellow.total)
          ? Math.round(game.counts.yellow.total * 10) / 10
          : null,
      projectedFoulsTotal:
        game.counts?.fouls && Number.isFinite(game.counts.fouls.total)
          ? Math.round(game.counts.fouls.total * 10) / 10
          : null,
    };
  }

  if (fallbackContext && fallbackContext.name.trim()) {
    const tier = fallbackContext.rigorTier ?? "promedio";
    const label =
      fallbackContext.rigorLabel ??
      (tier === "estricto" ? "Estricto" : tier === "permisivo" ? "Permisivo" : "Promedio");
    return {
      analytics: {
        name: fallbackContext.name,
        country: fallbackContext.country ?? undefined,
        matches: fallbackContext.matches ?? 0,
        avgYellow: fallbackContext.avgYellow,
        avgRed: fallbackContext.avgRed ?? null,
        avgFouls: fallbackContext.avgFouls,
        avgGoals: fallbackContext.avgGoals ?? null,
        ebYellow: fallbackContext.avgYellow,
        leagueMeanYellow: 4.15,
        rigorPercentile: tier === "estricto" ? 78 : tier === "permisivo" ? 22 : 50,
        rigorTier: tier,
        rigorLabel: label,
        rank: 1,
        totalInLeague: 1,
        upcoming: [],
      },
      matchLabel: fallbackContext.matchLabel ?? "Próximo encuentro",
      dayLabel: "",
      gameHref: "",
      isUpcoming: true,
      projectedYellowTotal: null,
      projectedFoulsTotal: null,
    };
  }

  return null;
}
