/**
 * Generador de snapshot y resultados de temporada para MLB.
 *
 * Corre el estimador walk-forward (`createMlbTracker`) partido a partido sobre la temporada
 * completa y publica pronósticos pre-partido (`analyzeMlbGame`) junto con tasas reales
 * de carreras anotadas/permitidas y la clasificación oficial AL/NL.
 */
import {
  GameAnalysisSchema,
  LeagueSnapshotSchema,
  asLeagueId,
  asSeasonId,
  type GameAnalysis,
  type GameDTO,
  type LeagueSnapshot,
  type StandingFormToken,
  type StandingRow,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import { analyzeMlbGame, createMlbTracker } from "@pitchlab/models";
import {
  getEmblemPath,
  getLeagueEmblemPath,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import type { MlbFetchedGame } from "./adapters/mlb-statsapi.js";
import { shouldPreservePublishedAnalysis } from "./pipeline.js";

const MX_DAY = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
});

export interface BuildMlbSnapshotParams {
  seasonYear: number;
  seasonGames: readonly MlbFetchedGame[];
  upcomingGames?: readonly MlbFetchedGame[];
  standings: readonly StandingRow[];
  now: Date;
  previousSnapshot: LeagueSnapshot | null;
}

export function buildMlbRecentFormMap(
  seasonGames: readonly MlbFetchedGame[],
): Map<string, StandingFormToken[]> {
  const map = new Map<string, StandingFormToken[]>();
  const regFinals = seasonGames
    .filter((g) => g.gameType === "R" && g.dto.status === "final" && g.dto.result)
    .slice()
    .sort((a, b) => a.dto.startTime.localeCompare(b.dto.startTime));

  for (const item of regFinals) {
    const { home, away, result } = item.dto;
    if (!result) continue;
    const hTok: StandingFormToken = result.home >= result.away ? "W" : "L";
    const aTok: StandingFormToken = result.away >= result.home ? "W" : "L";
    const hList = map.get(home.id) ?? [];
    hList.push(hTok);
    map.set(home.id, hList);
    const aList = map.get(away.id) ?? [];
    aList.push(aTok);
    map.set(away.id, aList);
  }
  return map;
}

export function buildMlbLeagueSnapshot(params: BuildMlbSnapshotParams): {
  snapshot: LeagueSnapshot;
  allPlayedForResults: GameDTO[];
} {
  const { seasonYear, seasonGames, upcomingGames = [], standings, now, previousSnapshot } = params;
  const updatedAt = now.toISOString();
  const seasonStr = String(seasonYear);

  const tracker = createMlbTracker();
  const playedReg = new Map<string, number>();
  const rsReg = new Map<string, number>();
  const raReg = new Map<string, number>();
  const teamMeta = new Map<string, GameDTO["home"]>();
  let gamesSeen = 0;

  // Pasada walk-forward sobre todos los juegos disputados de la temporada
  const chronological = [...seasonGames].sort((a, b) => a.dto.startTime.localeCompare(b.dto.startTime));
  const analysesBySeasonGameId = new Map<string, GameAnalysis>();
  const allPlayedForResults: GameDTO[] = [];

  for (const item of chronological) {
    const g = item.dto;
    if (!teamMeta.has(g.home.id)) teamMeta.set(g.home.id, g.home);
    if (!teamMeta.has(g.away.id)) teamMeta.set(g.away.id, g.away);

    if (g.status === "final" && g.result) {
      allPlayedForResults.push(g);
      // Pre-cálculo honesto antes de actualizar el tracker con el resultado real
      if (item.gameType !== "R") {
        const pred = tracker.predict({
          date: g.startTime.slice(0, 10),
          season: seasonStr,
          home: g.home.id,
          away: g.away.id,
        });
        analysesBySeasonGameId.set(
          g.id,
          GameAnalysisSchema.parse(
            analyzeMlbGame({
              game: g,
              prediction: pred,
              gamesSeen,
              homeGamesPlayed: playedReg.get(g.home.id) ?? 0,
              awayGamesPlayed: playedReg.get(g.away.id) ?? 0,
              homeStarterName: item.homeStarterName,
              awayStarterName: item.awayStarterName,
              inputsAsOf: updatedAt,
              publishedAt: g.startTime,
              source: "mlb_statsapi",
            }),
          ),
        );
      }

      tracker.update({
        date: g.startTime.slice(0, 10),
        season: seasonStr,
        home: g.home.id,
        away: g.away.id,
        homeScore: g.result.home,
        awayScore: g.result.away,
        homeStarterName: item.homeStarterName,
        awayStarterName: item.awayStarterName,
      });
      gamesSeen += 1;

      if (item.gameType === "R") {
        playedReg.set(g.home.id, (playedReg.get(g.home.id) ?? 0) + 1);
        playedReg.set(g.away.id, (playedReg.get(g.away.id) ?? 0) + 1);
        rsReg.set(g.home.id, (rsReg.get(g.home.id) ?? 0) + g.result.home);
        raReg.set(g.home.id, (raReg.get(g.home.id) ?? 0) + g.result.away);
        rsReg.set(g.away.id, (rsReg.get(g.away.id) ?? 0) + g.result.away);
        raReg.set(g.away.id, (raReg.get(g.away.id) ?? 0) + g.result.home);
      }
    }
  }

  // Ventana de partidos visibles: juegos cercanos a `now` si estamos en temporada;
  // en receso entre temporadas, postemporada reciente + primeros duelos oficiales programados.
  const nowMs = now.getTime();
  const inSeasonWindow = chronological.filter((item) => {
    const t = Date.parse(item.dto.startTime);
    return t >= nowMs - 4 * 86_400_000 && t <= nowMs + 7 * 86_400_000;
  });

  const visibleGames: GameDTO[] = [];
  const analyses: Record<string, GameAnalysis> = {};

  const pushAnalyzedGame = (item: MlbFetchedGame, nextSeasonId?: string) => {
    const g = item.dto;
    visibleGames.push(g);
    const prev = previousSnapshot?.analyses[g.id];
    if (prev && shouldPreservePublishedAnalysis(prev, g)) {
      analyses[g.id] = GameAnalysisSchema.parse(prev);
      return;
    }
    const precomputed = analysesBySeasonGameId.get(g.id);
    if (precomputed) {
      analyses[g.id] = precomputed;
      return;
    }
    const pred = tracker.predict({
      date: g.startTime.slice(0, 10),
      season: nextSeasonId ?? seasonStr,
      home: g.home.id,
      away: g.away.id,
    });
    analyses[g.id] = GameAnalysisSchema.parse(
      analyzeMlbGame({
        game: g,
        prediction: pred,
        gamesSeen,
        homeGamesPlayed: playedReg.get(g.home.id) ?? 0,
        awayGamesPlayed: playedReg.get(g.away.id) ?? 0,
        homeStarterName: item.homeStarterName,
        awayStarterName: item.awayStarterName,
        inputsAsOf: updatedAt,
        publishedAt: g.status === "final" ? g.startTime : updatedAt,
        source: "mlb_statsapi",
      }),
    );
  };

  if (inSeasonWindow.length > 0) {
    for (const item of inSeasonWindow) pushAnalyzedGame(item);
  } else {
    const postseason = chronological.filter((item) => item.gameType !== "R");
    const lastRegCutoff = chronological.at(-1)?.dto.startTime.slice(0, 10) ?? "";
    const seedRecent =
      postseason.length > 0
        ? postseason.slice(-24)
        : chronological.filter((item) => item.dto.startTime.slice(0, 10) >= lastRegCutoff).slice(-24);

    for (const item of seedRecent) pushAnalyzedGame(item);

    // Duelos inaugurales programados sin duplicar equipo en un mismo día UTC (regla validador)
    const scheduledDayTeams = new Set<string>();
    const nextSeasonTag = String(seasonYear + 1);
    for (const item of upcomingGames) {
      const g = item.dto;
      if (g.status !== "scheduled") continue;
      const dayKey = g.startTime.slice(0, 10);
      const hk = `${g.home.id}::${dayKey}`;
      const ak = `${g.away.id}::${dayKey}`;
      if (scheduledDayTeams.has(hk) || scheduledDayTeams.has(ak)) continue;
      scheduledDayTeams.add(hk);
      scheduledDayTeams.add(ak);
      pushAnalyzedGame(item, nextSeasonTag);
      if (visibleGames.filter((x) => x.status === "scheduled").length >= 30) break;
    }
  }

  // Tasas por equipo
  const trackerRatings = tracker.ratings();
  const teamRates: Record<string, TeamSeasonRate> = {};
  for (const row of standings) {
    const meta = teamMeta.get(row.teamId);
    const n = row.played > 0 ? row.played : (playedReg.get(row.teamId) ?? 0);
    const rf = n > 0 ? row.goalsFor / n : 4.42;
    const ra = n > 0 ? row.goalsAgainst / n : 4.42;
    const rat = trackerRatings[row.teamId];
    const slug = row.teamId.includes(".") ? row.teamId.split(".").slice(1).join(".") : row.teamId;
    teamRates[row.teamId] = {
      teamId: row.teamId,
      name: row.name,
      shortName: row.shortName,
      code: row.code,
      logoUrl:
        meta?.logoUrl ??
        row.logoUrl ??
        getOfficialEspnTeamLogoUrl("mlb", slug) ??
        getEmblemPath("mlb", slug),
      forPerGame: rf,
      againstPerGame: ra,
      gamesPlayed: n,
      adjustedFor: rat ? Math.max(1.8, 4.42 + rat.off) : rf,
      adjustedAgainst: rat ? Math.max(1.8, 4.42 - rat.def) : ra,
    };
  }

  const days = [...new Set(visibleGames.map((g) => MX_DAY.format(new Date(g.startTime))))];
  const periodLabel =
    inSeasonWindow.length > 0 && days.length > 0
      ? days.length === 1
        ? days[0]!
        : `${days[0]} – ${days.at(-1)}`
      : `Serie Mundial ${seasonYear}`;

  const snapshot = LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    league: asLeagueId("mlb"),
    logoUrl: getOfficialEspnLeagueLogoUrl("mlb") ?? getLeagueEmblemPath("mlb"),
    season: asSeasonId(`mlb-${seasonYear}`),
    seasonLabel: `Temporada ${seasonYear}`,
    periodLabel,
    updatedAt,
    source: "mlb_statsapi",
    provenance: "derived",
    isDemo: false,
    teamRates,
    games: visibleGames,
    analyses,
    standings: standings.length > 0 ? [...standings] : undefined,
  });

  return { snapshot, allPlayedForResults };
}
