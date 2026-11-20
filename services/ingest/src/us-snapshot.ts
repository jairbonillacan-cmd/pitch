/**
 * Snapshot diario de NBA y NHL (`data/snapshots/nba|nhl/latest.json`) con el motor de ratings
 * validado en `backtest:us` (docs/architecture/PLAN_MOTORES_Y_FUENTES_2026_11.md §8).
 *
 * Una sola pasada cronológica sobre toda la historia: cada partido de la ventana se predice con
 * lo previo (sin ver el futuro) y cada partido terminado actualiza las ratings después.
 * Los análisis ya publicados antes del inicio se conservan tal cual (historial íntegro).
 */
import {
  GameAnalysisSchema,
  LeagueSnapshotSchema,
  asGameId,
  asLeagueId,
  asSeasonId,
  asTeamId,
  type GameAnalysis,
  type GameDTO,
  type LeagueSnapshot,
  type StandingFormToken,
  type StandingRow,
  type Team,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import {
  analyzeUsGame,
  createNbaTracker,
  createNhlTracker,
  type NbaOptions,
  type NhlOptions,
  type UsGame,
} from "@pitchlab/models";
import { getTeamAsset } from "@pitchlab/sports-assets";
import { shouldPreservePublishedAnalysis } from "./pipeline.js";
import { mapBzzoiroLeagueLogoUrl, mapBzzoiroTeamLogoUrl } from "./providers/bzzoiro.js";
import type { UsGameRow, UsSport } from "./providers/bzzoiro-us.js";
import { slugifyTeamName } from "./team-slug.js";
import { divisionMetaForTeam, finalizeConferenceStandings } from "./us-divisions.js";

/** Parámetros elegidos por `backtest:us` (tramo de ajuste) — NBA sin descanso: no mejoró fuera de muestra. */
export const US_MODEL_PARAMS: { nba: Partial<NbaOptions>; nhl: Partial<NhlOptions> } = {
  nba: { k: 0.05, homeAdvantage: 1.6, sigmaMargin: 13, backToBack: 0, wellRested: 0, altitudeBonus: 1.5 },
  nhl: { k: 0.01, homeAdvantage: 0.04, backToBack: 0.1, overtimeTilt: 0, seasonRegression: 0.3 },
};

/** Abreviaturas oficiales NBA (las casas mexicanas las usan así). */
const NBA_CODES: Readonly<Record<string, string>> = {
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET", "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "LA Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
};

export function usTeam(sport: UsSport, side: UsGameRow["home"]): Team {
  const slug = slugifyTeamName(side.name);
  const id = `${sport}.${slug}`;
  if (sport === "nhl") {
    const asset = getTeamAsset(id);
    if (asset) {
      return { id: asTeamId(id), league: asLeagueId("nhl"), name: asset.name, shortName: asset.shortName, code: asset.code };
    }
  }
  const code = NBA_CODES[side.name] ?? slug.replace(/-/g, "").slice(0, 3).toUpperCase();
  const logoUrl =
    side.logoUrl ?? mapBzzoiroTeamLogoUrl(sport, slug, { providerTeamId: side.providerTeamId });
  return {
    id: asTeamId(id),
    league: asLeagueId(sport),
    name: side.name,
    shortName: side.shortName ?? side.name,
    code,
    ...(logoUrl ? { logoUrl } : {}),
  };
}

const STATUS: Record<string, GameDTO["status"]> = {
  scheduled: "scheduled",
  notstarted: "scheduled",
  finished: "final",
  live: "in_progress",
  inprogress: "in_progress",
  postponed: "postponed",
  cancelled: "canceled",
  canceled: "canceled",
};

const MX_DAY = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });

export interface BuildUsSnapshotParams {
  sport: UsSport;
  rows: readonly UsGameRow[];
  now: Date;
  previousSnapshot: LeagueSnapshot | null;
  /** Ventana de partidos visibles: desde `now − pastHours` hasta `now + aheadDays`. */
  pastHours?: number;
  aheadDays?: number;
}

export function buildUsLeagueSnapshot(params: BuildUsSnapshotParams): LeagueSnapshot {
  const { sport, rows, now } = params;
  const nowMs = now.getTime();
  const fromMs = nowMs - (params.pastHours ?? 36) * 3_600_000;
  const toMs = nowMs + (params.aheadDays ?? 3) * 86_400_000;
  const updatedAt = now.toISOString();

  const ordered = [...rows]
    .filter((r) => r.kickoffUtc && STATUS[r.status])
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const currentSeason = ordered.filter((r) => Date.parse(r.kickoffUtc) <= toMs).at(-1)?.season ?? "";

  const tracker = sport === "nba" ? createNbaTracker(US_MODEL_PARAMS.nba) : createNhlTracker(US_MODEL_PARAMS.nhl);
  const played = new Map<string, number>();
  const won = new Map<string, number>();
  const lost = new Map<string, number>();
  const otLost = new Map<string, number>();
  const pointsFor = new Map<string, number>();
  const pointsAgainst = new Map<string, number>();
  const formByTeam = new Map<string, StandingFormToken[]>();
  const teamsSeen = new Map<string, Team>();
  let seen = 0;

  const games: GameDTO[] = [];
  const analyses: Record<string, GameAnalysis> = {};

  for (const r of ordered) {
    const startMs = Date.parse(r.kickoffUtc);
    const home = usTeam(sport, r.home);
    const away = usTeam(sport, r.away);
    if (r.season === currentSeason) {
      if (!teamsSeen.has(home.id)) teamsSeen.set(home.id, home);
      if (!teamsSeen.has(away.id)) teamsSeen.set(away.id, away);
    }
    const usGame: UsGame = {
      date: r.kickoffUtc.slice(0, 10),
      season: r.season,
      home: home.id,
      away: away.id,
      homeScore: r.homeScore ?? 0,
      awayScore: r.awayScore ?? 0,
      overtime: r.overtime,
      shootout: r.shootout,
    };

    if (startMs >= fromMs && startMs <= toMs && r.season === currentSeason) {
      const status = STATUS[r.status]!;
      // Id propio: liga, fecha y equipos (nunca el id del proveedor).
      const id = asGameId(`${sport}-${usGame.date}-${away.code}-${home.code}`.toLowerCase());
      const game: GameDTO = {
        id,
        league: asLeagueId(sport),
        season: asSeasonId(`${sport}-${r.season}`),
        startTime: new Date(startMs).toISOString(),
        status,
        home,
        away,
        neutralSite: false,
        ...(status === "final" && r.homeScore !== null && r.awayScore !== null
          ? { result: { home: r.homeScore, away: r.awayScore, observedAt: updatedAt, source: "bzzoiro" } }
          : {}),
      };
      games.push(game);
      const prev = params.previousSnapshot?.analyses[id];
      if (prev && shouldPreservePublishedAnalysis(prev, game)) {
        analyses[id] = GameAnalysisSchema.parse(prev);
      } else if (status === "scheduled") {
        const publishedAt = updatedAt;
        analyses[id] = GameAnalysisSchema.parse(
          analyzeUsGame({
            sport,
            game,
            prediction: tracker.predict(usGame),
            gamesSeen: seen,
            homeGamesPlayed: played.get(home.id) ?? 0,
            awayGamesPlayed: played.get(away.id) ?? 0,
            inputsAsOf: publishedAt,
            publishedAt,
            source: "bzzoiro",
            ...(sport === "nba" ? { sigmaMargin: US_MODEL_PARAMS.nba.sigmaMargin, sigmaTotal: 18.5 } : { pHomeOvertime: 0.5 }),
          }),
        );
      }
    }

    if (r.status === "finished" && r.homeScore !== null && r.awayScore !== null) {
      tracker.update(usGame);
      seen++;
      if (r.season === currentSeason) {
        const homeWon = r.homeScore > r.awayScore;
        const awayWon = r.awayScore > r.homeScore;
        const isOtOrSo = sport === "nhl" && (r.overtime || r.shootout);
        for (const [team, f, a, isWinner, isLoser] of [
          [home.id, r.homeScore, r.awayScore, homeWon, awayWon],
          [away.id, r.awayScore, r.homeScore, awayWon, homeWon],
        ] as const) {
          played.set(team, (played.get(team) ?? 0) + 1);
          pointsFor.set(team, (pointsFor.get(team) ?? 0) + f);
          pointsAgainst.set(team, (pointsAgainst.get(team) ?? 0) + a);
          if (isWinner) {
            won.set(team, (won.get(team) ?? 0) + 1);
            const list = formByTeam.get(team) ?? [];
            list.push("W");
            formByTeam.set(team, list);
          } else if (isLoser) {
            if (isOtOrSo) {
              otLost.set(team, (otLost.get(team) ?? 0) + 1);
            } else {
              lost.set(team, (lost.get(team) ?? 0) + 1);
            }
            const list = formByTeam.get(team) ?? [];
            list.push("L");
            formByTeam.set(team, list);
          }
        }
      }
    }
  }

  const teamRates: Record<string, TeamSeasonRate> = {};
  for (const r of ordered.filter((x) => x.season === currentSeason)) {
    for (const side of [r.home, r.away]) {
      const t = usTeam(sport, side);
      const n = played.get(t.id) ?? 0;
      const pf = n ? (pointsFor.get(t.id) ?? 0) / n : 0;
      const pa = n ? (pointsAgainst.get(t.id) ?? 0) / n : 0;
      teamRates[t.id] = {
        teamId: t.id,
        name: t.name,
        shortName: t.shortName,
        code: t.code,
        ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
        forPerGame: pf,
        againstPerGame: pa,
        gamesPlayed: n,
        adjustedFor: pf,
        adjustedAgainst: pa,
      };
    }
  }

  const days = [...new Set(games.map((g) => MX_DAY.format(new Date(g.startTime))))];
  const periodLabel = days.length === 0 ? "Sin partidos" : days.length === 1 ? days[0]! : `${days[0]} – ${days.at(-1)}`;
  const leagueLogoUrl = mapBzzoiroLeagueLogoUrl(sport);

  const rawStandings: StandingRow[] = [...teamsSeen.values()]
    .map((t): StandingRow | null => {
      const gp = played.get(t.id) ?? 0;
      if (gp === 0) return null;
      const w = won.get(t.id) ?? 0;
      const l = lost.get(t.id) ?? 0;
      const otl = otLost.get(t.id) ?? 0;
      const gf = pointsFor.get(t.id) ?? 0;
      const ga = pointsAgainst.get(t.id) ?? 0;
      const meta = divisionMetaForTeam(sport, t.id);
      const pts = sport === "nhl" ? w * 2 + otl : w * 2;
      const winPct = Math.round((w / gp) * 1000) / 1000;
      const form = (formByTeam.get(t.id) ?? []).slice(-5);
      return {
        teamId: t.id,
        name: t.name,
        shortName: t.shortName,
        code: t.code,
        ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
        played: gp,
        won: w,
        drawn: 0,
        lost: l,
        goalsFor: gf,
        goalsAgainst: ga,
        points: pts,
        winPct,
        ...(sport === "nhl" ? { otLosses: otl } : {}),
        ...(meta ? { conference: meta.conference, division: meta.division } : {}),
        ...(form.length > 0 ? { form } : {}),
      };
    })
    .filter((row): row is StandingRow => row !== null);

  const standings = finalizeConferenceStandings(sport, rawStandings, {
    computeGamesBehind: sport === "nba",
  });

  return LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    league: asLeagueId(sport),
    ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
    season: asSeasonId(`${sport}-${currentSeason || "sin-temporada"}`),
    seasonLabel: `Temporada ${currentSeason}`,
    periodLabel,
    updatedAt,
    source: "bzzoiro",
    provenance: "derived",
    isDemo: false,
    teamRates,
    games,
    analyses,
    ...(standings.length > 0 ? { standings } : {}),
  });
}
