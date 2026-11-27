import {
  canonicalPlayerHref,
  cleanTeamRouteSlug,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  slugifyPlayerName,
  type SquadPlayerEntry,
  type StandingRow,
  type TeamInjuryEntry,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import { isHardBlockedAvailabilityV6 } from "@pitchlab/spacetime/v6";
import { scorePlayablePick } from "@pitchlab/ui/pick-quality-ranker";
import { catalogPickItemToMatchPick, type MatchPicksCatalog } from "@pitchlab/ui/picks-catalog";
import type {
  ConfirmedLineupPlayer,
  MatchEnfrentamientosData,
  MatchEnrichedLineups,
  MatchHistoryRow,
  MatchInjuryItem,
  MatchLineupPlayerDetail,
  MatchLineupSide,
  MatchPick,
  MatchPlayerPickItem,
  MatchupTeamRankings,
  PlatformGame,
  TeamRankingMetricRow,
  VerifiedMatchLineups,
} from "@pitchlab/ui/types";
import {
  checkStrictPlayerMinutesAndAvailabilityGuardV6,
  deriveMatchPlayerPropsV6,
  evaluateCoupledFootballShotsV6,
  evaluateGoalkeeperSavesV6,
  extractStrictAvgMinutesFromSquadPlayer,
  PROPS_V6_SHARP_EV_CAP_PCT,
  PROPS_V6_SOFT_EV_CAP_PCT,
  readLeagueInjuriesMap,
} from "./props-explorer";
import { resolveSnapshotsRoot } from "./snapshots";

export interface EnrichmentTeamRate {
  readonly teamId: string;
  readonly name: string;
  readonly shortName?: string;
  readonly forPerGame: number;
  readonly againstPerGame: number;
  readonly gamesPlayed: number;
  readonly adjustedFor?: number;
  readonly adjustedAgainst?: number;
}

export interface EnrichmentSnapshotLike {
  readonly teamRates?: Readonly<Record<string, EnrichmentTeamRate>>;
  readonly standings?: readonly StandingRow[];
}

export interface EnrichmentHistoryRecord {
  readonly id: string;
  readonly dateIso: string;
  readonly leagueLabel: string;
  readonly isHome: boolean;
  readonly opponentSlug: string;
  readonly opponentName: string;
  readonly opponentShort: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJerseyNumber(jersey: string | number | null | undefined): number | null {
  if (typeof jersey === "number") {
    return Number.isInteger(jersey) && jersey > 0 ? jersey : null;
  }
  if (typeof jersey === "string") {
    const clean = jersey.trim();
    if (/^\d{1,2}$/.test(clean)) {
      return Number.parseInt(clean, 10);
    }
  }
  return null;
}

function formatSquadStatsSummary(player: SquadPlayerEntry): string {
  const s = player.stats;
  if (s.appearances <= 0) {
    return "Plantilla primer equipo";
  }
  if (player.positionGroup === "GK") {
    return `${s.appearances} PJ · ${s.saves} atajadas · ${s.goalsConceded} GC`;
  }
  const parts: string[] = [`${s.appearances} PJ`];
  if (s.goals > 0) parts.push(`${s.goals} G`);
  if (s.assists > 0) parts.push(`${s.assists} A`);
  if (s.shotsOnTarget > 0) parts.push(`${s.shotsOnTarget} TP`);
  else if (s.shots > 0) parts.push(`${s.shots} tiros`);
  if (parts.length === 1 && s.yellowCards > 0) {
    parts.push(`${s.yellowCards} TA`);
  }
  return parts.join(" · ");
}

function parseFormationCounts(formation: string | null | undefined): {
  readonly def: number;
  readonly mid: number;
  readonly fwd: number;
} {
  const parts = (formation ?? "")
    .trim()
    .split(/[^0-9]+/)
    .filter((seg) => seg.length > 0)
    .map((seg) => Number.parseInt(seg, 10))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 6);

  if (parts.length >= 2) {
    const normalized = parts[0] === 1 && parts.length >= 3 ? parts.slice(1) : parts;
    const sum = normalized.reduce((acc, n) => acc + n, 0);
    if (sum === 10 && normalized.length >= 2) {
      const def = normalized[0] ?? 4;
      const fwd = normalized[normalized.length - 1] ?? 1;
      const mid = Math.max(1, 10 - def - fwd);
      return { def, mid, fwd };
    }
  }
  return { def: 4, mid: 3, fwd: 3 };
}

function mapSquadPlayerToLineupDetail(params: {
  readonly league: string;
  readonly teamSlug: string;
  readonly player: SquadPlayerEntry;
  readonly isStarter: boolean;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
  readonly overrideJersey?: number | null;
  readonly overridePosition?: string | null;
}): MatchLineupPlayerDetail {
  const {
    league,
    teamSlug,
    player,
    isStarter,
    sanitizePhotoKey,
    overrideJersey,
    overridePosition,
  } = params;
  const jerseyNum = overrideJersey ?? parseJerseyNumber(player.jersey);
  const recentMatches = (player.recentGames ?? [])
    .filter((rg) => isSafePublicLabel(rg.opponent))
    .slice(0, 5)
    .map((rg) => ({
      dateIso: rg.dateIso,
      opponent: rg.opponent,
      score: rg.score ?? null,
      result: rg.result ?? null,
      statsSummary: rg.stats
        .filter((st) => isSafePublicLabel(st.label) && isSafePublicLabel(st.value))
        .slice(0, 3)
        .map((st) => `${st.label}: ${st.value}`)
        .join(" · "),
    }));

  const safePositionRaw = overridePosition ?? player.positionLabel;
  const safePositionLabel = isSafePublicLabel(safePositionRaw) ? safePositionRaw : "XI";
  const safeNationality =
    player.nationality && isSafePublicLabel(player.nationality) ? player.nationality : null;
  const safeNationalityCode =
    player.nationalityCode && isSafePublicLabel(player.nationalityCode)
      ? player.nationalityCode
      : null;

  return {
    id: player.id,
    name: player.name,
    shortName: isSafePublicLabel(player.shortName) ? player.shortName : player.name,
    slug: player.slug,
    jersey: jerseyNum !== null ? String(jerseyNum) : player.jersey ?? null,
    positionGroup: player.positionGroup,
    positionLabel: safePositionLabel,
    age: player.age ?? null,
    heightCm: player.heightCm ?? null,
    nationality: safeNationality,
    nationalityCode: safeNationalityCode,
    photoKey: sanitizePhotoKey(player.photoKey),
    fallbackPhotoKey: sanitizePhotoKey(player.fallbackPhotoKey),
    rating: null,
    statsSummary: formatSquadStatsSummary(player),
    playerHref: canonicalPlayerHref(league, teamSlug, player.slug),
    recentMatches,
    isStarter,
    availability: player.availability ?? "available",
  };
}

function mapConfirmedStarterToDetail(params: {
  readonly league: string;
  readonly teamSlug: string;
  readonly starter: ConfirmedLineupPlayer;
  readonly squad: TeamSquadEntry | null;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
}): { readonly detail: MatchLineupPlayerDetail; readonly matchedId: string | null } {
  const { league, teamSlug, starter, squad, sanitizePhotoKey } = params;
  const starterNorm = normalizeToken(starter.name);
  const starterSlug = slugifyPlayerName(starter.name);
  const match =
    squad?.players.find(
      (p) =>
        p.slug === starterSlug ||
        normalizeToken(p.name) === starterNorm ||
        normalizeToken(p.shortName) === starterNorm,
    ) ?? null;

  if (match) {
    return {
      detail: mapSquadPlayerToLineupDetail({
        league,
        teamSlug: squad?.teamSlug ?? teamSlug,
        player: match,
        isStarter: true,
        sanitizePhotoKey,
        overrideJersey: starter.number ?? null,
        overridePosition: starter.position ?? null,
      }),
      matchedId: match.id,
    };
  }

  const fallbackPosition =
    starter.position && isSafePublicLabel(starter.position) ? starter.position : "XI";
  const fallbackSlug = starterSlug || normalizeToken(starter.name).replace(/\s+/g, "-");
  return {
    detail: {
      id: `${teamSlug}-${fallbackSlug}`,
      name: starter.name,
      shortName: starter.name,
      slug: fallbackSlug,
      jersey: starter.number !== undefined ? String(starter.number) : null,
      positionGroup: "MID",
      positionLabel: fallbackPosition,
      age: null,
      heightCm: null,
      nationality: null,
      nationalityCode: null,
      photoKey: null,
      fallbackPhotoKey: null,
      rating: null,
      statsSummary: "Titular del partido",
      playerHref: fallbackSlug ? canonicalPlayerHref(league, teamSlug, fallbackSlug) : null,
      recentMatches: [],
      isStarter: true,
      availability: "available",
    },
    matchedId: null,
  };
}

function sortSquadForSelection(players: readonly SquadPlayerEntry[]): SquadPlayerEntry[] {
  return [...players].sort((a, b) => {
    const aStarts = a.stats.appearances - a.stats.subIns * 0.5;
    const bStarts = b.stats.appearances - b.stats.subIns * 0.5;
    if (bStarts !== aStarts) return bStarts - aStarts;
    return b.stats.appearances - a.stats.appearances;
  });
}

function buildLineupSide(params: {
  readonly league: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly squad: TeamSquadEntry | null;
  readonly confirmedStarters?: readonly ConfirmedLineupPlayer[];
  readonly explicitFormation?: string | null;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
}): MatchLineupSide {
  const {
    league,
    teamSlug,
    teamName,
    squad,
    confirmedStarters,
    explicitFormation,
    sanitizePhotoKey,
  } = params;
  const effectiveTeamSlug = squad?.teamSlug ?? teamSlug;
  const formation = explicitFormation ?? squad?.coach?.preferredFormation ?? "4-2-3-1";
  const coachName = squad?.coach?.name ?? squad?.coachName ?? null;
  const coachPhotoKey = sanitizePhotoKey(squad?.coach?.photoKey);
  const coachNationality = squad?.coach?.nationality ?? null;

  const players = (squad?.players ?? []).filter((p) => isSafePublicLabel(p.name));
  const unavailableEntries = players.filter((p) =>
    isHardBlockedAvailabilityV6(p.availability, null),
  );
  const availableEntries = sortSquadForSelection(
    players.filter((p) => !isHardBlockedAvailabilityV6(p.availability, null)),
  );

  let starters: MatchLineupPlayerDetail[] = [];
  const usedIds = new Set<string>();

  if (confirmedStarters && confirmedStarters.length > 0) {
    for (const st of confirmedStarters.filter((s) => isSafePublicLabel(s.name)).slice(0, 11)) {
      const mapped = mapConfirmedStarterToDetail({
        league,
        teamSlug: effectiveTeamSlug,
        starter: st,
        squad,
        sanitizePhotoKey,
      });
      starters.push(mapped.detail);
      if (mapped.matchedId) usedIds.add(mapped.matchedId);
    }
  } else if (availableEntries.length > 0) {
    const targets = parseFormationCounts(formation);
    const pickGroup = (group: SquadPlayerEntry["positionGroup"], count: number): void => {
      for (const p of availableEntries) {
        if (starters.length >= 11) break;
        if (usedIds.has(p.id) || p.positionGroup !== group) continue;
        if (starters.filter((s) => s.positionGroup === group).length >= count) break;
        usedIds.add(p.id);
        starters.push(
          mapSquadPlayerToLineupDetail({
            league,
            teamSlug: effectiveTeamSlug,
            player: p,
            isStarter: true,
            sanitizePhotoKey,
          }),
        );
      }
    };

    pickGroup("GK", 1);
    pickGroup("DEF", targets.def);
    pickGroup("MID", targets.mid);
    pickGroup("FWD", targets.fwd);

    for (const p of availableEntries) {
      if (starters.length >= 11) break;
      if (usedIds.has(p.id)) continue;
      usedIds.add(p.id);
      starters.push(
        mapSquadPlayerToLineupDetail({
          league,
          teamSlug: effectiveTeamSlug,
          player: p,
          isStarter: true,
          sanitizePhotoKey,
        }),
      );
    }

    const groupRank: Record<SquadPlayerEntry["positionGroup"], number> = {
      GK: 0,
      DEF: 1,
      MID: 2,
      FWD: 3,
    };
    starters = starters.slice().sort((a, b) => groupRank[a.positionGroup] - groupRank[b.positionGroup]);
  }

  const substitutes = availableEntries
    .filter((p) => !usedIds.has(p.id))
    .slice(0, 12)
    .map((p) =>
      mapSquadPlayerToLineupDetail({
        league,
        teamSlug: effectiveTeamSlug,
        player: p,
        isStarter: false,
        sanitizePhotoKey,
      }),
    );

  const unavailable = unavailableEntries
    .filter((p) => !usedIds.has(p.id))
    .map((p) =>
      mapSquadPlayerToLineupDetail({
        league,
        teamSlug: effectiveTeamSlug,
        player: p,
        isStarter: false,
        sanitizePhotoKey,
      }),
    );

  return {
    teamSlug: effectiveTeamSlug,
    teamName,
    formation,
    coachName: coachName && isSafePublicLabel(coachName) ? coachName : null,
    coachPhotoKey,
    coachNationality: coachNationality && isSafePublicLabel(coachNationality) ? coachNationality : null,
    starters,
    substitutes,
    unavailable,
  };
}

export function buildEnrichedMatchLineups(params: {
  readonly game: PlatformGame;
  readonly allowFull?: boolean;
  readonly homeSquad: TeamSquadEntry | null;
  readonly awaySquad: TeamSquadEntry | null;
  readonly confirmedLineups?: VerifiedMatchLineups | null;
  readonly probableLineups?: VerifiedMatchLineups | null;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
}): MatchEnrichedLineups | null {
  const {
    game,
    allowFull = false,
    homeSquad,
    awaySquad,
    confirmedLineups,
    probableLineups,
    sanitizePhotoKey,
  } = params;
  if (game.sport !== "football") {
    return null;
  }
  if (!allowFull && game.status !== "FT") {
    return null;
  }

  const source = confirmedLineups ?? probableLineups ?? null;

  const isConfirmed =
    Boolean(confirmedLineups) && confirmedLineups?.status !== "predicted";

  const home = buildLineupSide({
    league: game.league,
    teamSlug: game.home.slug,
    teamName: game.home.name,
    squad: homeSquad,
    confirmedStarters: source?.homeStarters,
    explicitFormation: source?.homeFormation,
    sanitizePhotoKey,
  });

  const away = buildLineupSide({
    league: game.league,
    teamSlug: game.away.slug,
    teamName: game.away.name,
    squad: awaySquad,
    confirmedStarters: source?.awayStarters,
    explicitFormation: source?.awayFormation,
    sanitizePhotoKey,
  });

  if (home.starters.length === 0 && away.starters.length === 0) {
    return null;
  }

  return {
    status: isConfirmed ? "confirmed" : "probable",
    bannerLabel: isConfirmed
      ? "Alineación confirmada oficial"
      : "Alineación probable — sujeta a cambios",
    home,
    away,
  };
}

function competitionRank(values: readonly number[], target: number, higherIsBetter: boolean): number {
  let better = 0;
  for (const v of values) {
    if (higherIsBetter ? v > target + 1e-6 : v < target - 1e-6) {
      better += 1;
    }
  }
  return better + 1;
}

function resolveMatchingTeamKey<T>(
  entries: ReadonlyArray<readonly [string, T]>,
  targetSlug: string,
  targetName: string,
  targetShort: string,
  getLabels: (v: T) => readonly string[],
  resolveCanonicalSlug: (raw: string) => string = cleanTeamRouteSlug,
): string | null {
  const slugCanon = resolveCanonicalSlug(targetSlug);
  const nameNorm = normalizeToken(targetName);
  const shortNorm = normalizeToken(targetShort);

  for (const [key, item] of entries) {
    const labels = getLabels(item);
    for (const label of labels) {
      if (!label) continue;
      if (resolveCanonicalSlug(label) === slugCanon) return key;
      const n = normalizeToken(label);
      if (n && (n === nameNorm || n === shortNorm)) return key;
    }
  }
  return null;
}

function scoringUnitLabels(sport: PlatformGame["sport"]): {
  readonly forLabel: string;
  readonly againstLabel: string;
} {
  if (sport === "baseball") {
    return {
      forLabel: "Carreras anotadas / PJ",
      againstLabel: "Carreras recibidas / PJ",
    };
  }
  if (sport === "basketball" || sport === "american-football") {
    return {
      forLabel: "Puntos anotados / PJ",
      againstLabel: "Puntos recibidos / PJ",
    };
  }
  return {
    forLabel: "Goles anotados / PJ",
    againstLabel: "Goles recibidos / PJ",
  };
}

function buildMatchupRankings(
  game: PlatformGame,
  snapshot: EnrichmentSnapshotLike | null,
  resolveCanonicalSlug: (raw: string) => string = cleanTeamRouteSlug,
  allowFull = false,
): MatchupTeamRankings | null {
  if (!snapshot) return null;
  const attack: TeamRankingMetricRow[] = [];
  const defense: TeamRankingMetricRow[] = [];
  const unitLabels = scoringUnitLabels(game.sport);

  const ratesList = Object.entries(snapshot.teamRates ?? {}).filter(
    ([, r]) => r.gamesPlayed > 0 && Number.isFinite(r.forPerGame) && Number.isFinite(r.againstPerGame),
  );
  const standingsList = (snapshot.standings ?? [])
    .filter((s) => s.played > 0)
    .map((s) => [s.teamId, s] as const);

  const homeRateKey = resolveMatchingTeamKey(
    ratesList,
    game.home.slug,
    game.home.name,
    game.home.shortName,
    (r) => [r.teamId, r.name, r.shortName ?? ""],
    resolveCanonicalSlug,
  );
  const awayRateKey = resolveMatchingTeamKey(
    ratesList,
    game.away.slug,
    game.away.name,
    game.away.shortName,
    (r) => [r.teamId, r.name, r.shortName ?? ""],
    resolveCanonicalSlug,
  );

  const pushMetric = (
    bucket: TeamRankingMetricRow[],
    metric: {
      readonly key: string;
      readonly label: string;
      readonly unit: string;
      readonly homeVal: number;
      readonly awayVal: number;
      readonly allVals: readonly number[];
      readonly higherIsBetter: boolean;
      readonly decimals?: number;
    },
  ): void => {
    if (metric.allVals.length < 2) return;
    const dec = metric.decimals ?? 2;
    const factor = 10 ** dec;
    bucket.push({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      homeValue: Math.round(metric.homeVal * factor) / factor,
      homeRank: competitionRank(metric.allVals, metric.homeVal, metric.higherIsBetter),
      awayValue: Math.round(metric.awayVal * factor) / factor,
      awayRank: competitionRank(metric.allVals, metric.awayVal, metric.higherIsBetter),
      higherIsBetter: metric.higherIsBetter,
    });
  };

  let hasGoalsFromRates = false;
  if (homeRateKey && awayRateKey && ratesList.length >= 2) {
    const rateMap = new Map(ratesList);
    const hr = rateMap.get(homeRateKey);
    const ar = rateMap.get(awayRateKey);
    if (hr && ar) {
      hasGoalsFromRates = true;
      pushMetric(attack, {
        key: "for_per_game",
        label: unitLabels.forLabel,
        unit: "",
        homeVal: hr.forPerGame,
        awayVal: ar.forPerGame,
        allVals: ratesList.map(([, r]) => r.forPerGame),
        higherIsBetter: true,
      });
      if (
        allowFull &&
        typeof hr.adjustedFor === "number" &&
        typeof ar.adjustedFor === "number" &&
        Number.isFinite(hr.adjustedFor) &&
        Number.isFinite(ar.adjustedFor)
      ) {
        const adjForVals = ratesList
          .map(([, r]) => r.adjustedFor)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        pushMetric(attack, {
          key: "adjusted_offense",
          label: "Índice ofensivo ajustado",
          unit: "",
          homeVal: hr.adjustedFor,
          awayVal: ar.adjustedFor,
          allVals: adjForVals,
          higherIsBetter: true,
        });
      }
      pushMetric(defense, {
        key: "against_per_game",
        label: unitLabels.againstLabel,
        unit: "",
        homeVal: hr.againstPerGame,
        awayVal: ar.againstPerGame,
        allVals: ratesList.map(([, r]) => r.againstPerGame),
        higherIsBetter: false,
      });
      if (
        allowFull &&
        typeof hr.adjustedAgainst === "number" &&
        typeof ar.adjustedAgainst === "number" &&
        Number.isFinite(hr.adjustedAgainst) &&
        Number.isFinite(ar.adjustedAgainst)
      ) {
        const adjDefVals = ratesList
          .map(([, r]) => r.adjustedAgainst)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        pushMetric(defense, {
          key: "adjusted_defense",
          label: "Concesión defensiva ajustada",
          unit: "",
          homeVal: hr.adjustedAgainst,
          awayVal: ar.adjustedAgainst,
          allVals: adjDefVals,
          higherIsBetter: false,
        });
      }
    }
  }

  const homeStKey = resolveMatchingTeamKey(
    standingsList,
    game.home.slug,
    game.home.name,
    game.home.shortName,
    (s) => [s.teamId, s.name, s.shortName],
    resolveCanonicalSlug,
  );
  const awayStKey = resolveMatchingTeamKey(
    standingsList,
    game.away.slug,
    game.away.name,
    game.away.shortName,
    (s) => [s.teamId, s.name, s.shortName],
    resolveCanonicalSlug,
  );

  if (homeStKey && awayStKey && standingsList.length >= 2) {
    const stMap = new Map(standingsList);
    const hs = stMap.get(homeStKey);
    const as = stMap.get(awayStKey);
    if (hs && as) {
      if (!hasGoalsFromRates) {
        pushMetric(attack, {
          key: "goals_for_pg",
          label: unitLabels.forLabel,
          unit: "",
          homeVal: hs.goalsFor / hs.played,
          awayVal: as.goalsFor / as.played,
          allVals: standingsList.map(([, s]) => s.goalsFor / s.played),
          higherIsBetter: true,
        });
        pushMetric(defense, {
          key: "goals_against_pg",
          label: unitLabels.againstLabel,
          unit: "",
          homeVal: hs.goalsAgainst / hs.played,
          awayVal: as.goalsAgainst / as.played,
          allVals: standingsList.map(([, s]) => s.goalsAgainst / s.played),
          higherIsBetter: false,
        });
      }
      if (game.sport === "football") {
        pushMetric(attack, {
          key: "points_pg",
          label: "Puntos por partido",
          unit: "pts",
          homeVal: hs.points / hs.played,
          awayVal: as.points / as.played,
          allVals: standingsList.map(([, s]) => s.points / s.played),
          higherIsBetter: true,
        });
      }
      pushMetric(attack, {
        key: "win_rate",
        label: "Porcentaje de victorias",
        unit: "%",
        homeVal: (hs.won / hs.played) * 100,
        awayVal: (as.won / as.played) * 100,
        allVals: standingsList.map(([, s]) => (s.won / s.played) * 100),
        higherIsBetter: true,
        decimals: 0,
      });
      pushMetric(defense, {
        key: "goal_diff_pg",
        label: "Diferencial neto / PJ",
        unit: "",
        homeVal: (hs.goalsFor - hs.goalsAgainst) / hs.played,
        awayVal: (as.goalsFor - as.goalsAgainst) / as.played,
        allVals: standingsList.map(([, s]) => (s.goalsFor - s.goalsAgainst) / s.played),
        higherIsBetter: true,
      });
    }
  }

  if (attack.length === 0 && defense.length === 0) {
    return null;
  }

  return {
    leagueSize: Math.max(ratesList.length, standingsList.length),
    attack,
    defense,
  };
}

function mapTeamHistoryRows(
  game: PlatformGame,
  side: "home" | "away",
  leagueLabel: string,
  entries: readonly EnrichmentHistoryRecord[],
): readonly MatchHistoryRow[] {
  const focusTeam = side === "home" ? game.home : game.away;
  const focusName = focusTeam.shortName || focusTeam.name;
  const targetLeagueNorm = normalizeToken(leagueLabel);

  return entries.slice(0, 20).map((entry) => {
    const isSameComp = normalizeToken(entry.leagueLabel) === targetLeagueNorm;
    const homeTeam = entry.isHome ? focusName : entry.opponentShort || entry.opponentName;
    const awayTeam = entry.isHome ? entry.opponentShort || entry.opponentName : focusName;
    const homeSlug = entry.isHome ? focusTeam.slug : entry.opponentSlug;
    const awaySlug = entry.isHome ? entry.opponentSlug : focusTeam.slug;
    const homeScore = entry.isHome ? entry.goalsFor : entry.goalsAgainst;
    const awayScore = entry.isHome ? entry.goalsAgainst : entry.goalsFor;
    const resultForFocus: MatchHistoryRow["resultForFocus"] =
      entry.goalsFor > entry.goalsAgainst
        ? "W"
        : entry.goalsFor < entry.goalsAgainst
          ? "L"
          : "D";

    return {
      id: entry.id,
      dateIso: entry.dateIso,
      competitionLabel: entry.leagueLabel,
      isSameCompetition: isSameComp,
      homeTeam,
      awayTeam,
      homeSlug,
      awaySlug,
      homeScore,
      awayScore,
      isHomeForFocus: entry.isHome,
      resultForFocus,
    };
  });
}

export function buildMatchEnfrentamientos(params: {
  readonly game: PlatformGame;
  readonly leagueLabel: string;
  readonly snapshot: EnrichmentSnapshotLike | null;
  readonly homeHistory: readonly EnrichmentHistoryRecord[];
  readonly awayHistory: readonly EnrichmentHistoryRecord[];
  readonly allowFull?: boolean;
  readonly resolveCanonicalSlug?: (raw: string) => string;
}): MatchEnfrentamientosData {
  const {
    game,
    leagueLabel,
    snapshot,
    homeHistory,
    awayHistory,
    allowFull = false,
    resolveCanonicalSlug,
  } = params;
  const homeNorm = normalizeToken(game.home.name);
  const awayNorm = normalizeToken(game.away.name);

  const h2h: MatchHistoryRow[] = game.headToHead.map((row, idx) => {
    const rowHomeNorm = normalizeToken(row.home);
    const focusIsRowHome =
      rowHomeNorm === homeNorm || rowHomeNorm === normalizeToken(game.home.shortName);
    const focusIsRowAway =
      normalizeToken(row.away) === homeNorm ||
      normalizeToken(row.away) === normalizeToken(game.home.shortName);
    const isHomeForFocus = focusIsRowHome || !focusIsRowAway;
    const focusGoals = isHomeForFocus ? row.homeGoals : row.awayGoals;
    const oppGoals = isHomeForFocus ? row.awayGoals : row.homeGoals;
    const resultForFocus: MatchHistoryRow["resultForFocus"] =
      focusGoals > oppGoals ? "W" : focusGoals < oppGoals ? "L" : "D";
    const rowHomeSlug = rowHomeNorm === awayNorm ? game.away.slug : game.home.slug;
    const rowAwaySlug = normalizeToken(row.away) === homeNorm ? game.home.slug : game.away.slug;

    return {
      id: `h2h-${game.id}-${idx}`,
      dateIso: row.date,
      competitionLabel: leagueLabel,
      isSameCompetition: true,
      homeTeam: row.home,
      awayTeam: row.away,
      homeSlug: rowHomeSlug,
      awaySlug: rowAwaySlug,
      homeScore: row.homeGoals,
      awayScore: row.awayGoals,
      isHomeForFocus,
      resultForFocus,
    };
  });

  return {
    rankings: buildMatchupRankings(game, snapshot, resolveCanonicalSlug, allowFull),
    h2h,
    homeRecent: mapTeamHistoryRows(game, "home", leagueLabel, homeHistory),
    awayRecent: mapTeamHistoryRows(game, "away", leagueLabel, awayHistory),
  };
}

function inferDirectionFromLabel(label: string): "over" | "under" | "other" {
  const lower = label.toLowerCase();
  if (lower.includes("menos") || lower.includes("under")) return "under";
  if (lower.includes("más") || lower.includes("mas ") || lower.includes("over")) return "over";
  return "other";
}

function findSquadPlayerByMeta(
  squad: TeamSquadEntry | null,
  playerName: string,
  playerSlug?: string | null,
): SquadPlayerEntry | null {
  if (!squad) return null;
  const targetNorm = normalizeToken(playerName);
  const slug = playerSlug ?? slugifyPlayerName(playerName);
  return (
    squad.players.find(
      (p) =>
        p.slug === slug ||
        normalizeToken(p.name) === targetNorm ||
        normalizeToken(p.shortName) === targetNorm,
    ) ?? null
  );
}

const PLAYER_SHARP_BOOK_TOKENS = ["pinnacle", "betcris", "betonline"] as const;
const MAX_PLAYER_SHARP_EV_PCT = PROPS_V6_SHARP_EV_CAP_PCT;
const MAX_PLAYER_SOFT_EV_PCT = PROPS_V6_SOFT_EV_CAP_PCT;
const NUMERIC_UNIT_RE =
  /\b(goles?|gol|tiros?|remates?|puntos?|rebotes?|asistencias?|triples?|atajadas?|yardas?|pases?|recepciones?|carreras?|hits?|bases?|jonrones?|ponches?|entradas?|touchdowns?|acarreos?|targets?|tarjetas?|faltas?|c[oó]rners?|saques?|pts|reb|ast|3pm|sot|sog)\b/i;

function isSharpPlayerQuoteBook(bookLabel?: string | null): boolean {
  if (!bookLabel) return false;
  const norm = normalizeToken(bookLabel);
  if (!norm) return false;
  return PLAYER_SHARP_BOOK_TOKENS.some((token) => norm.includes(token));
}

function hasNumericSelectionUnit(label: string): boolean {
  if (!/\d/.test(label)) return true;
  return NUMERIC_UNIT_RE.test(label);
}

function decimalToAmericanOdds(decimal: number): number {
  const safe = Math.max(1.01, decimal);
  if (safe >= 2.0) return Math.round((safe - 1) * 100);
  return -Math.round(100 / (safe - 1));
}

function pickNearestLine<T extends { readonly line: number }>(
  lines: readonly T[],
  targetLine: number,
): T | null {
  if (lines.length === 0) return null;
  let best = lines[0]!;
  let bestDist = Math.abs(best.line - targetLine);
  for (let i = 1; i < lines.length; i += 1) {
    const cand = lines[i]!;
    const dist = Math.abs(cand.line - targetLine);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
}

function selectPlayableLine<
  T extends { readonly line: number; readonly pOver: number | null; readonly fairOverDecimal: number | null },
>(lines: readonly T[]): T | null {
  const valid = lines.filter(
    (l): l is T & { readonly pOver: number; readonly fairOverDecimal: number } =>
      typeof l.pOver === "number" &&
      Number.isFinite(l.pOver) &&
      typeof l.fairOverDecimal === "number" &&
      Number.isFinite(l.fairOverDecimal),
  );
  if (valid.length === 0) return null;
  const playable = valid.filter(
    (l) => l.fairOverDecimal >= 1.55 && l.fairOverDecimal <= 2.6,
  );
  const pool = playable.length > 0 ? playable : valid;
  let best = pool[0]!;
  let bestDist = Math.abs(best.pOver - 0.56);
  for (let i = 1; i < pool.length; i += 1) {
    const cand = pool[i]!;
    const dist = Math.abs(cand.pOver - 0.56);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
}

function collectTeamSlugAliases(
  gameSlug: string,
  squad: TeamSquadEntry | null,
): readonly string[] {
  const raw = [
    cleanTeamRouteSlug(gameSlug),
    gameSlug.trim().toLowerCase(),
    ...(squad
      ? [
          cleanTeamRouteSlug(squad.teamSlug),
          squad.teamSlug.trim().toLowerCase(),
          cleanTeamRouteSlug(squad.teamId),
        ]
      : []),
  ];
  return Array.from(new Set(raw.filter((s) => s.length > 0)));
}

function buildInjuryStatusIndex(params: {
  readonly game: PlatformGame;
  readonly homeSquad: TeamSquadEntry | null;
  readonly awaySquad: TeamSquadEntry | null;
  readonly leagueInjuries?: readonly TeamInjuryEntry[];
}): {
  readonly bySidePlayer: ReadonlyMap<string, string>;
  readonly byTeamSlugPlayer: ReadonlyMap<string, string>;
} {
  const bySidePlayer = new Map<string, string>();
  const byTeamSlugPlayer = new Map<string, string>();
  const homeSlugs = collectTeamSlugAliases(params.game.home.slug, params.homeSquad);
  const awaySlugs = collectTeamSlugAliases(params.game.away.slug, params.awaySquad);
  const homeSet = new Set(homeSlugs);
  const awaySet = new Set(awaySlugs);

  const registerSideInjury = (
    side: "home" | "away",
    pNorm: string,
    status: string,
    override: boolean,
  ): void => {
    const sideKey = `${side}|${pNorm}`;
    if (override || !bySidePlayer.has(sideKey)) {
      bySidePlayer.set(sideKey, status);
    }
    const targetSlugs = side === "home" ? homeSlugs : awaySlugs;
    for (const slug of targetSlugs) {
      const slugKey = `${slug}|${pNorm}`;
      if (override || !byTeamSlugPlayer.has(slugKey)) {
        byTeamSlugPlayer.set(slugKey, status);
      }
    }
  };

  if (params.leagueInjuries !== undefined) {
    for (const entry of params.leagueInjuries) {
      const pNorm = normalizeToken(entry.player);
      if (!pNorm) continue;
      const entryCanon = cleanTeamRouteSlug(entry.teamId);
      const entryRaw = entry.teamId.trim().toLowerCase();
      const side: "home" | "away" | null =
        homeSet.has(entryCanon) || homeSet.has(entryRaw)
          ? "home"
          : awaySet.has(entryCanon) || awaySet.has(entryRaw)
            ? "away"
            : null;
      if (side) {
        registerSideInjury(side, pNorm, entry.status, true);
      }
      if (entryCanon) {
        byTeamSlugPlayer.set(`${entryCanon}|${pNorm}`, entry.status);
      }
    }
  } else {
    const diskMap = readLeagueInjuriesMap(resolveSnapshotsRoot(), String(params.game.league));
    for (const [key, entry] of diskMap.entries()) {
      const sepIdx = key.indexOf("|");
      if (sepIdx <= 0) continue;
      const teamPart = key.slice(0, sepIdx);
      const pNorm = key.slice(sepIdx + 1);
      if (!pNorm) continue;
      const teamCanon = cleanTeamRouteSlug(teamPart);
      if (homeSet.has(teamPart) || homeSet.has(teamCanon)) {
        registerSideInjury("home", pNorm, entry.status, false);
      } else if (awaySet.has(teamPart) || awaySet.has(teamCanon)) {
        registerSideInjury("away", pNorm, entry.status, false);
      }
    }
  }

  for (const abs of params.game.preGame?.absences ?? []) {
    const pNorm = normalizeToken(abs.player);
    if (!pNorm) continue;
    registerSideInjury(abs.teamSide, pNorm, abs.status, false);
  }

  return { bySidePlayer, byTeamSlugPlayer };
}

export function buildMatchPlayerPicks(params: {
  readonly game: PlatformGame;
  readonly allowFull: boolean;
  readonly catalog: MatchPicksCatalog | null;
  readonly homeSquad: TeamSquadEntry | null;
  readonly awaySquad: TeamSquadEntry | null;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
  readonly leagueInjuries?: readonly TeamInjuryEntry[];
  readonly teamExpectedShots?: { readonly home?: number | null; readonly away?: number | null };
  readonly teamExpectedSoT?: { readonly home?: number | null; readonly away?: number | null };
}): readonly MatchPlayerPickItem[] {
  const { game, allowFull, catalog, homeSquad, awaySquad, sanitizePhotoKey } = params;
  if (!allowFull) {
    return [];
  }

  const injuryIdx = buildInjuryStatusIndex({
    game,
    homeSquad,
    awaySquad,
    leagueInjuries: params.leagueInjuries,
  });

  const out: MatchPlayerPickItem[] = [];
  const seen = new Set<string>();

  if (catalog) {
    catalog.picks.forEach((item, idx) => {
      if (!item.playerMeta) return;
      const meta = item.playerMeta;
      if (
        !isSafePublicLabel(meta.playerName) ||
        !isSafePublicLabel(item.label) ||
        !isSafePublicLabel(meta.teamName) ||
        !isSafePublicLabel(meta.statLabel) ||
        !hasNumericSelectionUnit(item.label)
      ) {
        return;
      }
      const squad = meta.teamSide === "home" ? homeSquad : awaySquad;
      const squadPlayer = findSquadPlayerByMeta(squad, meta.playerName, meta.playerSlug);
      const reportedInjury =
        injuryIdx.bySidePlayer.get(`${meta.teamSide}|${normalizeToken(meta.playerName)}`) ?? null;

      if (isHardBlockedAvailabilityV6(squadPlayer?.availability, reportedInjury)) {
        return;
      }

      if (game.sport === "football" || game.sport === "basketball") {
        const resolvedAvgMin =
          typeof meta.avgMinutes === "number" && Number.isFinite(meta.avgMinutes)
            ? meta.avgMinutes
            : squadPlayer
              ? extractStrictAvgMinutesFromSquadPlayer(squadPlayer, game.sport)
              : null;
        const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
          sport: game.sport,
          avgMinutes: resolvedAvgMin,
          availability: squadPlayer?.availability,
          injuryStatus: reportedInjury,
        });
        if (!guard.eligible) {
          return;
        }
      }

      const playerSlug = meta.playerSlug ?? squadPlayer?.slug ?? slugifyPlayerName(meta.playerName);
      const teamSlug =
        meta.teamSlug ??
        squad?.teamSlug ??
        (meta.teamSide === "home" ? game.home.slug : game.away.slug);
      const direction: MatchPlayerPickItem["direction"] =
        item.direction === "over" || item.direction === "under"
          ? item.direction
          : inferDirectionFromLabel(item.label);
      const dedupKey = `${playerSlug}|${meta.statKey}|${item.line ?? "null"}|${direction}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const rawBookLabel = item.pricing.marketBookLabel;
      const permittedQuote =
        rawBookLabel && isSafePublicLabel(rawBookLabel) && isPermittedMarketQuoteBook(rawBookLabel);
      const safeMarketBookLabel = permittedQuote ? rawBookLabel : null;
      const safeMarketDecimal = permittedQuote ? item.pricing.marketDecimal : null;
      const evLimit = isSharpPlayerQuoteBook(safeMarketBookLabel)
        ? MAX_PLAYER_SHARP_EV_PCT
        : MAX_PLAYER_SOFT_EV_PCT;
      const rawEvPct = permittedQuote ? item.pricing.evPct : null;
      const safeEvPct =
        rawEvPct !== null && Number.isFinite(rawEvPct) && rawEvPct <= evLimit ? rawEvPct : null;

      const baseMatchPick = catalogPickItemToMatchPick(item, game, idx);
      const matchPick: MatchPick = {
        ...baseMatchPick,
        marketDecimal: safeMarketDecimal,
        marketAmerican: safeMarketDecimal ? baseMatchPick.marketAmerican : null,
        marketBookLabel: safeMarketBookLabel,
        edgePts: safeEvPct !== null ? baseMatchPick.edgePts : null,
      };
      const safePosition =
        meta.position && isSafePublicLabel(meta.position)
          ? meta.position
          : squadPlayer?.positionLabel && isSafePublicLabel(squadPlayer.positionLabel)
            ? squadPlayer.positionLabel
            : null;
      const safeBullets = item.evidence.bullets
        .filter((b) => isSafePublicLabel(b.label))
        .slice(0, 3)
        .map((b) => ({
          label: b.label,
          ratePct: b.ratePct,
          tone:
            b.tone === "high"
              ? ("green" as const)
              : b.tone === "mid"
                ? ("amber" as const)
                : b.tone === "low"
                  ? ("red" as const)
                  : ("neutral" as const),
        }));

      out.push({
        id: item.id,
        playerName: meta.playerName,
        playerSlug: playerSlug || null,
        teamSide: meta.teamSide,
        teamName: meta.teamName,
        teamSlug,
        positionLabel: safePosition,
        photoKey: sanitizePhotoKey(meta.photoKey ?? squadPlayer?.photoKey),
        fallbackPhotoKey: sanitizePhotoKey(squadPlayer?.fallbackPhotoKey),
        playerHref:
          playerSlug && teamSlug ? canonicalPlayerHref(game.league, teamSlug, playerSlug) : null,
        marketKey: meta.statKey,
        marketLabel: meta.statLabel,
        direction,
        selectionLabel: item.label,
        line: item.line,
        p: item.pricing.p,
        fairDecimal: item.pricing.fairOdds,
        marketDecimal: safeMarketDecimal,
        marketBookLabel: safeMarketBookLabel,
        evPct: safeEvPct,
        evidenceBullets: safeBullets,
        pick: matchPick,
      });
    });
  }

  if (game.sport === "football") {
    const sides: ReadonlyArray<{
      readonly side: "home" | "away";
      readonly teamName: string;
      readonly teamSlug: string;
      readonly squad: TeamSquadEntry | null;
      readonly teamProjGoals: number | null;
      readonly oppProjGoals: number | null;
      readonly teamExpShots: number | null;
      readonly teamExpSoT: number | null;
      readonly oppExpSoT: number | null;
    }> = [
      {
        side: "home",
        teamName: game.home.name,
        teamSlug: homeSquad?.teamSlug ?? game.home.slug,
        squad: homeSquad,
        teamProjGoals: game.projection?.home ?? null,
        oppProjGoals: game.projection?.away ?? null,
        teamExpShots: params.teamExpectedShots?.home ?? null,
        teamExpSoT: params.teamExpectedSoT?.home ?? null,
        oppExpSoT: params.teamExpectedSoT?.away ?? null,
      },
      {
        side: "away",
        teamName: game.away.name,
        teamSlug: awaySquad?.teamSlug ?? game.away.slug,
        squad: awaySquad,
        teamProjGoals: game.projection?.away ?? null,
        oppProjGoals: game.projection?.home ?? null,
        teamExpShots: params.teamExpectedShots?.away ?? null,
        teamExpSoT: params.teamExpectedSoT?.away ?? null,
        oppExpSoT: params.teamExpectedSoT?.home ?? null,
      },
    ];

    const matchLabel = `${game.home.shortName} vs ${game.away.shortName}`;

    for (const s of sides) {
      if (!s.squad) continue;
      for (const player of s.squad.players) {
        const reportedInjury =
          injuryIdx.bySidePlayer.get(`${s.side}|${normalizeToken(player.name)}`) ?? null;
        if (isHardBlockedAvailabilityV6(player.availability, reportedInjury)) continue;
        if (!isSafePublicLabel(player.name) || player.stats.appearances < 3) continue;

        const avgMinutes = extractStrictAvgMinutesFromSquadPlayer(player, "football");
        const minGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
          sport: "football",
          avgMinutes,
          availability: player.availability,
          injuryStatus: reportedInjury,
        });
        if (!minGuard.eligible || avgMinutes === null) continue;

        let emittedSavesForPlayer = false;

        for (const cp of player.candidatePicks ?? []) {
          if (
            !isSafePublicLabel(cp.selectionLabel) ||
            !isSafePublicLabel(cp.rationale) ||
            !isSafePublicLabel(cp.marketLabel) ||
            !hasNumericSelectionUnit(cp.selectionLabel)
          ) {
            continue;
          }
          if (
            !(
              Number.isFinite(cp.p) &&
              cp.p > 0.02 &&
              cp.p < 0.98 &&
              Number.isFinite(cp.fairDecimal) &&
              cp.fairDecimal > 1.01
            )
          ) {
            continue;
          }

          const direction = inferDirectionFromLabel(cp.selectionLabel);
          const statKeyAlias =
            cp.marketKey === "player_sot"
              ? "shots_on_target"
              : cp.marketKey === "player_shots"
                ? "shots"
                : cp.marketKey === "player_goal"
                  ? "player_goals"
                  : cp.marketKey;
          const exactKey = `${player.slug}|${cp.marketKey}|${cp.line ?? "null"}|${direction}`;
          const aliasKey = `${player.slug}|${statKeyAlias}|${cp.line ?? "null"}|${direction}`;
          if (seen.has(exactKey) || seen.has(aliasKey)) continue;

          let resolvedP = cp.p;
          let resolvedFairDecimal = cp.fairDecimal;
          let resolvedFairAmerican = cp.fairAmerican;
          let resolvedEngineName = "PitchLab Tachyon v5.1";
          let resolvedRationale = cp.rationale;

          if (cp.marketKey === "player_shots" || cp.marketKey === "player_sot") {
            const metric = cp.marketKey === "player_shots" ? "shots" : "shots_on_target";
            const seasonCount =
              metric === "shots" ? player.stats.shots : player.stats.shotsOnTarget;
            const coupled = evaluateCoupledFootballShotsV6({
              metric,
              playerName: player.name,
              positionGroup: player.positionGroup,
              positionLabel: player.positionLabel,
              seasonCount,
              seasonShotsTotal: player.stats.shots,
              appearances: player.stats.appearances,
              subIns: player.stats.subIns,
              avgMinutes,
              teamExpectedShots: s.teamExpShots,
              teamExpectedSoT: s.teamExpSoT,
              teamProjectedGoals: s.teamProjGoals,
              availability: player.availability,
              injuryStatus: reportedInjury,
              allowFull: true,
            });
            const matched = pickNearestLine(coupled.lines, cp.line ?? 0.5);
            if (!coupled.eligible || !matched) {
              continue;
            }
            if (direction === "under") {
              if (matched.pUnder === null || matched.fairUnderDecimal === null) {
                continue;
              }
              resolvedP = matched.pUnder;
              resolvedFairDecimal = matched.fairUnderDecimal;
              resolvedFairAmerican = decimalToAmericanOdds(matched.fairUnderDecimal);
              resolvedEngineName = "PitchLab Spacetime v6.0";
            } else {
              if (matched.pOver === null || matched.fairOverDecimal === null) {
                continue;
              }
              resolvedP = matched.pOver;
              resolvedFairDecimal = matched.fairOverDecimal;
              resolvedFairAmerican = decimalToAmericanOdds(matched.fairOverDecimal);
              resolvedEngineName = "PitchLab Spacetime v6.0";
            }
          } else if (cp.marketKey === "player_saves") {
            emittedSavesForPlayer = true;
            const gkEval = evaluateGoalkeeperSavesV6({
              playerName: player.name,
              saves: player.stats.saves,
              shotsFaced: player.stats.shotsFaced,
              goalsConceded: player.stats.goalsConceded,
              appearances: player.stats.appearances,
              subIns: player.stats.subIns,
              avgMinutes,
              oppExpectedSoT: s.oppExpSoT,
              oppProjectedGoals: s.oppProjGoals,
              availability: player.availability,
              injuryStatus: reportedInjury,
              allowFull: true,
            });
            const matched = pickNearestLine(gkEval.lines, cp.line ?? 2.5);
            if (!gkEval.eligible || !matched) {
              continue;
            }
            const sideP = direction === "under" ? matched.pUnder : matched.pOver;
            const sideDec =
              direction === "under" ? matched.fairUnderDecimal : matched.fairOverDecimal;
            if (sideP === null || sideDec === null) {
              continue;
            }
            resolvedP = sideP;
            resolvedFairDecimal = sideDec;
            resolvedFairAmerican = decimalToAmericanOdds(sideDec);
            resolvedEngineName = "PitchLab Spacetime v6.0";
            if (gkEval.expectedSaves !== null) {
              resolvedRationale = `${player.stats.saves} atajadas en ${player.stats.appearances} PJ · proyección ${gkEval.expectedSaves.toFixed(2)} atajadas.`;
            }
          }

          seen.add(exactKey);

          const safeShortPlayer = isSafePublicLabel(player.shortName)
            ? player.shortName
            : player.name;
          const fullLabel = `${safeShortPlayer} · ${cp.selectionLabel}`;
          const pickId = `${game.id}-pp-${player.slug}-${cp.id}`;
          const matchPick: MatchPick = {
            id: pickId,
            gameId: game.id,
            league: game.league,
            leagueLabel: game.leagueLabel,
            matchLabel,
            kickoffLocal: game.kickoffLocal,
            gameStatus: game.status,
            slotIndex: 50 + out.length,
            category: "tactico",
            categoryLabel: cp.marketLabel,
            risk: resolvedP >= 0.62 ? "conservador" : resolvedP >= 0.45 ? "medio" : "arriesgado",
            engineKey: "tachyon",
            engineName: resolvedEngineName,
            marketGroup: cp.marketLabel,
            selectionKey: `${cp.marketKey}:${player.slug}:${cp.line ?? "0"}`,
            market: cp.marketKey,
            line: cp.line,
            conflictGroup: "independent",
            label: fullLabel,
            rationale: resolvedRationale,
            p: resolvedP,
            fairDecimal: resolvedFairDecimal,
            fairAmerican: resolvedFairAmerican,
            marketDecimal: null,
            marketAmerican: null,
            marketBookLabel: null,
            marketCapturedAtUtc: null,
            edgePts: null,
            confidenceScore: Math.round(resolvedP * 100),
            suggestedUnits: 0.75,
          };

          const hitRatePct = Math.round(resolvedP * 100);
          const bullets: MatchPlayerPickItem["evidenceBullets"] = [
            {
              label: resolvedRationale,
              ratePct: hitRatePct,
              tone: hitRatePct >= 62 ? "green" : hitRatePct >= 45 ? "amber" : "neutral",
            },
          ];

          out.push({
            id: pickId,
            playerName: player.name,
            playerSlug: player.slug,
            teamSide: s.side,
            teamName: s.teamName,
            teamSlug: s.teamSlug,
            positionLabel: isSafePublicLabel(player.positionLabel) ? player.positionLabel : null,
            photoKey: sanitizePhotoKey(player.photoKey),
            fallbackPhotoKey: sanitizePhotoKey(player.fallbackPhotoKey),
            playerHref: canonicalPlayerHref(game.league, s.teamSlug, player.slug),
            marketKey: cp.marketKey,
            marketLabel: cp.marketLabel,
            direction,
            selectionLabel: cp.selectionLabel,
            line: cp.line,
            p: resolvedP,
            fairDecimal: resolvedFairDecimal,
            marketDecimal: null,
            marketBookLabel: null,
            evPct: null,
            evidenceBullets: bullets,
            pick: matchPick,
          });
        }

        if (player.positionGroup === "GK" && player.stats.saves >= 3 && !emittedSavesForPlayer) {
          const gkEval = evaluateGoalkeeperSavesV6({
            playerName: player.name,
            saves: player.stats.saves,
            shotsFaced: player.stats.shotsFaced,
            goalsConceded: player.stats.goalsConceded,
            appearances: player.stats.appearances,
            subIns: player.stats.subIns,
            avgMinutes,
            oppExpectedSoT: s.oppExpSoT,
            oppProjectedGoals: s.oppProjGoals,
            availability: player.availability,
            injuryStatus: reportedInjury,
            allowFull: true,
          });
          const bestLine = selectPlayableLine(gkEval.lines);
          if (
            gkEval.eligible &&
            bestLine &&
            bestLine.pOver !== null &&
            bestLine.fairOverDecimal !== null &&
            gkEval.expectedSaves !== null
          ) {
            const gkKey = `${player.slug}|player_saves|${bestLine.line}|over`;
            if (!seen.has(gkKey)) {
              seen.add(gkKey);
              const safeShortPlayer = isSafePublicLabel(player.shortName)
                ? player.shortName
                : player.name;
              const rationale = `${player.stats.saves} atajadas en ${player.stats.appearances} PJ · proyección ${gkEval.expectedSaves.toFixed(2)} atajadas.`;
              const pickId = `${game.id}-pp-${player.slug}-saves-${bestLine.line}`;
              const hitRatePct = Math.round(bestLine.pOver * 100);
              const matchPick: MatchPick = {
                id: pickId,
                gameId: game.id,
                league: game.league,
                leagueLabel: game.leagueLabel,
                matchLabel,
                kickoffLocal: game.kickoffLocal,
                gameStatus: game.status,
                slotIndex: 50 + out.length,
                category: "tactico",
                categoryLabel: "Atajadas",
                risk:
                  bestLine.pOver >= 0.62
                    ? "conservador"
                    : bestLine.pOver >= 0.45
                      ? "medio"
                      : "arriesgado",
                engineKey: "tachyon",
                engineName: "PitchLab Spacetime v6.0",
                marketGroup: "Atajadas",
                selectionKey: `player_saves:${player.slug}:${bestLine.line}`,
                market: "player_saves",
                line: bestLine.line,
                conflictGroup: "independent",
                label: `${safeShortPlayer} · ${bestLine.selectionLabel}`,
                rationale,
                p: bestLine.pOver,
                fairDecimal: bestLine.fairOverDecimal,
                fairAmerican: decimalToAmericanOdds(bestLine.fairOverDecimal),
                marketDecimal: null,
                marketAmerican: null,
                marketBookLabel: null,
                marketCapturedAtUtc: null,
                edgePts: null,
                confidenceScore: hitRatePct,
                suggestedUnits: 0.75,
              };
              out.push({
                id: pickId,
                playerName: player.name,
                playerSlug: player.slug,
                teamSide: s.side,
                teamName: s.teamName,
                teamSlug: s.teamSlug,
                positionLabel: isSafePublicLabel(player.positionLabel) ? player.positionLabel : null,
                photoKey: sanitizePhotoKey(player.photoKey),
                fallbackPhotoKey: sanitizePhotoKey(player.fallbackPhotoKey),
                playerHref: canonicalPlayerHref(game.league, s.teamSlug, player.slug),
                marketKey: "player_saves",
                marketLabel: "Atajadas",
                direction: "over",
                selectionLabel: bestLine.selectionLabel,
                line: bestLine.line,
                p: bestLine.pOver,
                fairDecimal: bestLine.fairOverDecimal,
                marketDecimal: null,
                marketBookLabel: null,
                evPct: null,
                evidenceBullets: [
                  {
                    label: rationale,
                    ratePct: hitRatePct,
                    tone: hitRatePct >= 62 ? "green" : hitRatePct >= 45 ? "amber" : "neutral",
                  },
                ],
                pick: matchPick,
              });
            }
          }
        }
      }
    }
  } else {
    const usDerived = deriveMatchPlayerPropsV6({
      gameId: game.id,
      league: String(game.league),
      sport: game.sport,
      homeTeamName: game.home.name,
      homeTeamSlug: game.home.slug,
      awayTeamName: game.away.name,
      awayTeamSlug: game.away.slug,
      homeSquad,
      awaySquad,
      injuryStatusByTeamPlayer: injuryIdx.byTeamSlugPlayer,
      allowFull: true,
    });
    const matchLabel = `${game.away.shortName} @ ${game.home.shortName}`;

    for (const dp of usDerived) {
      if (
        !isSafePublicLabel(dp.playerName) ||
        !isSafePublicLabel(dp.selectionLabel) ||
        !isSafePublicLabel(dp.marketLabel) ||
        !hasNumericSelectionUnit(dp.selectionLabel)
      ) {
        continue;
      }
      const dedupKey = `${dp.playerSlug}|${dp.marketKey}|${dp.line}|${dp.direction}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const hitRatePct = Math.round(dp.pOver * 100);
      const matchPick: MatchPick = {
        id: dp.id,
        gameId: game.id,
        league: game.league,
        leagueLabel: game.leagueLabel,
        matchLabel,
        kickoffLocal: game.kickoffLocal,
        gameStatus: game.status,
        slotIndex: 50 + out.length,
        category: "tactico",
        categoryLabel: dp.marketLabel,
        risk: dp.pOver >= 0.62 ? "conservador" : dp.pOver >= 0.45 ? "medio" : "arriesgado",
        engineKey: "tachyon",
        engineName: dp.engineName,
        marketGroup: dp.marketLabel,
        selectionKey: `${dp.marketKey}:${dp.playerSlug}:${dp.line}`,
        market: dp.marketKey,
        line: dp.line,
        conflictGroup: "independent",
        label: `${dp.playerName} · ${dp.selectionLabel}`,
        rationale: dp.rationaleEs,
        p: dp.pOver,
        fairDecimal: dp.fairOverDecimal,
        fairAmerican: decimalToAmericanOdds(dp.fairOverDecimal),
        marketDecimal: null,
        marketAmerican: null,
        marketBookLabel: null,
        marketCapturedAtUtc: null,
        edgePts: null,
        confidenceScore: hitRatePct,
        suggestedUnits: 0.75,
      };

      out.push({
        id: dp.id,
        playerName: dp.playerName,
        playerSlug: dp.playerSlug,
        teamSide: dp.teamSide,
        teamName: dp.teamName,
        teamSlug: dp.teamSlug,
        positionLabel: dp.positionLabel,
        photoKey: sanitizePhotoKey(dp.photoKey),
        fallbackPhotoKey: sanitizePhotoKey(dp.fallbackPhotoKey),
        playerHref: canonicalPlayerHref(game.league, dp.teamSlug, dp.playerSlug),
        marketKey: dp.marketKey,
        marketLabel: dp.marketLabel,
        direction: dp.direction,
        selectionLabel: dp.selectionLabel,
        line: dp.line,
        p: dp.pOver,
        fairDecimal: dp.fairOverDecimal,
        marketDecimal: null,
        marketBookLabel: null,
        evPct: null,
        evidenceBullets: [
          {
            label: dp.rationaleEs,
            ratePct: hitRatePct,
            tone: hitRatePct >= 62 ? "green" : hitRatePct >= 45 ? "amber" : "neutral",
          },
        ],
        pick: matchPick,
      });
    }
  }

  return out
    .slice()
    .sort((a, b) => {
      const bScore = scorePlayablePick({
        market: b.marketKey,
        label: b.selectionLabel,
        p: b.p,
        decimal: b.marketDecimal ?? b.fairDecimal,
        evPct: b.evPct,
      });
      const aScore = scorePlayablePick({
        market: a.marketKey,
        label: a.selectionLabel,
        p: a.p,
        decimal: a.marketDecimal ?? a.fairDecimal,
        evPct: a.evPct,
      });
      return bScore - aScore || b.p - a.p;
    })
    .slice(0, 40);
}

function mapSquadAvailabilityStatus(
  availability: SquadPlayerEntry["availability"],
): string {
  if (availability === "doubtful") return "Duda";
  if (availability === "suspended") return "Suspendido";
  return "Baja";
}

export function buildEnrichedMatchInjuries(params: {
  readonly game: PlatformGame;
  readonly allowFull: boolean;
  readonly leagueInjuries: readonly TeamInjuryEntry[];
  readonly homeSquad: TeamSquadEntry | null;
  readonly awaySquad: TeamSquadEntry | null;
  readonly sanitizePhotoKey: (raw?: string | null) => string | null;
  readonly resolveCanonicalSlug?: (raw: string) => string;
}): readonly MatchInjuryItem[] {
  const {
    game,
    allowFull,
    leagueInjuries,
    homeSquad,
    awaySquad,
    sanitizePhotoKey,
    resolveCanonicalSlug = cleanTeamRouteSlug,
  } = params;
  if (!allowFull && game.status !== "FT") {
    return [];
  }
  const homeCanon = resolveCanonicalSlug(game.home.slug);
  const awayCanon = resolveCanonicalSlug(game.away.slug);
  const byKey = new Map<string, MatchInjuryItem>();

  const upsert = (item: MatchInjuryItem): void => {
    const key = `${item.teamSide}|${normalizeToken(item.player)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      return;
    }
    byKey.set(key, {
      ...prev,
      playerSlug: prev.playerSlug ?? item.playerSlug,
      position: prev.position ?? item.position,
      detail: prev.detail ?? item.detail,
      injuryCategory: prev.injuryCategory ?? item.injuryCategory,
      expectedReturn: prev.expectedReturn ?? item.expectedReturn,
      reportedAt: prev.reportedAt ?? item.reportedAt,
      photoKey: prev.photoKey ?? item.photoKey,
      fallbackPhotoKey: prev.fallbackPhotoKey ?? item.fallbackPhotoKey,
    });
  };

  for (const entry of leagueInjuries) {
    const entryCanon = resolveCanonicalSlug(entry.teamId);
    const teamSide: "home" | "away" | null =
      entryCanon === homeCanon ? "home" : entryCanon === awayCanon ? "away" : null;
    if (!teamSide) continue;
    const playerName = entry.player.trim();
    if (!playerName || !isSafePublicLabel(playerName)) continue;
    const squad = teamSide === "home" ? homeSquad : awaySquad;
    const squadMatch = findSquadPlayerByMeta(squad, playerName, null);
    const rawDetail = entry.detail?.trim() ?? null;
    const safeDetail =
      rawDetail && rawDetail.toLowerCase() !== "unknown" && isSafePublicLabel(rawDetail)
        ? rawDetail
        : null;
    const safePos = entry.position && isSafePublicLabel(entry.position) ? entry.position.trim() : null;

    upsert({
      teamSide,
      player: playerName,
      playerSlug: squadMatch?.slug ?? (slugifyPlayerName(playerName) || null),
      position: safePos ?? squadMatch?.positionLabel ?? null,
      status: isSafePublicLabel(entry.status) ? entry.status.trim() : "Baja",
      detail: safeDetail,
      injuryCategory: entry.injuryType && isSafePublicLabel(entry.injuryType) ? entry.injuryType : null,
      expectedReturn: entry.returnDate ?? null,
      reportedAt: entry.reportedAt ?? null,
      photoKey: sanitizePhotoKey(squadMatch?.photoKey),
      fallbackPhotoKey: sanitizePhotoKey(squadMatch?.fallbackPhotoKey),
    });
  }

  const squadSides: ReadonlyArray<{ readonly side: "home" | "away"; readonly squad: TeamSquadEntry | null }> = [
    { side: "home", squad: homeSquad },
    { side: "away", squad: awaySquad },
  ];
  for (const s of squadSides) {
    if (!s.squad) continue;
    for (const player of s.squad.players) {
      if (!player.availability || player.availability === "available") continue;
      if (!isSafePublicLabel(player.name)) continue;
      const safeDetail =
        player.injuryDetail && isSafePublicLabel(player.injuryDetail)
          ? player.injuryDetail.trim()
          : null;
      upsert({
        teamSide: s.side,
        player: player.name,
        playerSlug: player.slug,
        position: isSafePublicLabel(player.positionLabel) ? player.positionLabel : null,
        status: mapSquadAvailabilityStatus(player.availability),
        detail: safeDetail,
        injuryCategory: safeDetail,
        expectedReturn:
          player.expectedReturn && isSafePublicLabel(player.expectedReturn)
            ? player.expectedReturn
            : null,
        reportedAt: s.squad.updatedAt ?? null,
        photoKey: sanitizePhotoKey(player.photoKey),
        fallbackPhotoKey: sanitizePhotoKey(player.fallbackPhotoKey),
      });
    }
  }

  if (allowFull) {
    for (const abs of game.preGame?.absences ?? []) {
      const playerName = abs.player.trim();
      if (!playerName || !isSafePublicLabel(playerName)) continue;
      const rawDetail = (abs.injuryType ?? abs.impactNote)?.trim() ?? null;
      const safeDetail = rawDetail && isSafePublicLabel(rawDetail) ? rawDetail : null;
      const safePos = abs.role && isSafePublicLabel(abs.role) ? abs.role.trim() : null;
      const safeStatus = isSafePublicLabel(abs.status) ? abs.status.trim() : "Baja";
      const safeInjuryCategory =
        abs.injuryType && isSafePublicLabel(abs.injuryType) ? abs.injuryType.trim() : null;
      const safeReturnDate =
        abs.returnDate && isSafePublicLabel(abs.returnDate) ? abs.returnDate.trim() : null;
      const squad = abs.teamSide === "home" ? homeSquad : awaySquad;
      const squadMatch = findSquadPlayerByMeta(squad, playerName, null);

      upsert({
        teamSide: abs.teamSide,
        player: playerName,
        playerSlug: squadMatch?.slug ?? (slugifyPlayerName(playerName) || null),
        position:
          safePos ??
          (squadMatch?.positionLabel && isSafePublicLabel(squadMatch.positionLabel)
            ? squadMatch.positionLabel
            : null),
        status: safeStatus,
        detail: safeDetail,
        injuryCategory: safeInjuryCategory,
        expectedReturn: safeReturnDate,
        reportedAt: null,
        photoKey: sanitizePhotoKey(squadMatch?.photoKey),
        fallbackPhotoKey: sanitizePhotoKey(squadMatch?.fallbackPhotoKey),
      });
    }
  }

  return Array.from(byKey.values()).slice(0, 28);
}
