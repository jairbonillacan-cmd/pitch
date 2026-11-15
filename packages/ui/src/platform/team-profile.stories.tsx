import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
import {
  TeamProfileClubView,
  type TeamProfileData,
} from "./club/team/TeamProfileClubView";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { ViewerRole } from "./types";

const STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-15T12:00:00Z",
    games: [],
    standings: [],
  },
]);

const SOCCER_PROFILE: TeamProfileData = {
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  seasonLabel: "Apertura 2026",
  updatedAt: "15 nov 2026",
  team: {
    id: "liga-mx.monterrey",
    slug: "monterrey",
    name: "Rayados de Monterrey",
    shortName: "Monterrey",
    code: "MTY",
  },
  standing: {
    rank: 2,
    totalTeams: 18,
    played: 16,
    won: 10,
    drawn: 3,
    lost: 3,
    goalsFor: 31,
    goalsAgainst: 17,
    goalDiff: 14,
    points: 33,
  },
  venue: {
    name: "Estadio BBVA",
    elevationM: 537,
    roofType: "open",
  },
  injuries: [],
  recentAverages: {
    sampleGames: 10,
    scoredAvg: 2.1,
    concededAvg: 1.0,
    marginAvg: 1.1,
    cleanSheets: 4,
    wins: 7,
    draws: 2,
    losses: 1,
    homeRecord: { games: 5, wins: 4, draws: 1, losses: 0, scoredAvg: 2.4, concededAvg: 0.8 },
    awayRecord: { games: 5, wins: 3, draws: 1, losses: 1, scoredAvg: 1.8, concededAvg: 1.2 },
    streak: ["G", "E", "G", "G", "G"],
  },
  modelSection: {
    locked: false,
    engineLabel: "Tachyon v3.0 · Índice de fuerza",
    sampleNote: "Calibración con 16 partidos registrados en la temporada vigente",
    updatedLabel: "15 nov 2026",
    metrics: [
      { id: "adj-for", label: "Ataque ajustado", value: "1.98 goles/p", detail: "Crudo: 1.94 goles/p", tone: "positive" },
      { id: "adj-against", label: "Defensa ajustada", value: "1.02 goles/p", detail: "Crudo concedido: 1.06/p", tone: "positive" },
      { id: "elo", label: "Índice de fuerza Elo", value: "1,712 pts", detail: "Fuerza relativa de club", tone: "brand" },
      { id: "xg-for", label: "Goles esperados (xG)", value: "28.4", detail: "Sin penales: 24.9", tone: "positive" },
      { id: "xg-against", label: "xG concedidos", value: "16.2", detail: "Sin penales: 14.8" },
      { id: "xpts", label: "Puntos esperados (xPts)", value: "30.8", detail: "Diferencia vs tabla: +2.2" },
    ],
    unavailableReason: null,
  },
  upcomingFixtures: [
    {
      id: "mx-story-mty-tig",
      gameHref: "/app/liga-mx/games/mx-story-mty-tig",
      dateLabel: "sáb, 22 nov",
      kickoffLocal: "21:00",
      round: "Jornada 17",
      venue: "Estadio BBVA",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "tigres-uanl", name: "Tigres UANL", shortName: "Tigres", href: "/app/liga-mx/teams/tigres-uanl" },
      hasForecast: true,
      isRedacted: false,
      projectedTeamScore: 1.68,
      projectedOpponentScore: 1.21,
      winProbability: 0.48,
      confidenceLabel: "Confianza media",
    },
  ],
  recentMatches: [
    {
      id: "m1",
      gameHref: "/app/liga-mx/games/m1",
      date: "2026-11-10",
      dateLabel: "10 nov 2026",
      round: "Jornada 16",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "cruz-azul", name: "Cruz Azul", shortName: "Cruz Azul", href: "/app/liga-mx/teams/cruz-azul" },
      teamScore: 2,
      opponentScore: 1,
      outcome: "G",
      resultNote: null,
    },
    {
      id: "m2",
      gameHref: null,
      date: "2026-11-02",
      dateLabel: "2 nov 2026",
      round: "Jornada 15",
      isHome: false,
      neutralSite: false,
      opponent: { slug: "america", name: "Club América", shortName: "América", href: "/app/liga-mx/teams/america" },
      teamScore: 1,
      opponentScore: 1,
      outcome: "E",
      resultNote: null,
    },
    {
      id: "m3",
      gameHref: null,
      date: "2026-10-26",
      dateLabel: "26 oct 2026",
      round: "Jornada 14",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "pumas-unam", name: "Pumas UNAM", shortName: "Pumas", href: "/app/liga-mx/teams/pumas-unam" },
      teamScore: 3,
      opponentScore: 0,
      outcome: "G",
      resultNote: null,
    },
  ],
  relatedTeams: [
    { slug: "cruz-azul", name: "Cruz Azul", shortName: "Cruz Azul", rank: 1, href: "/app/liga-mx/teams/cruz-azul" },
    { slug: "america", name: "Club América", shortName: "América", rank: 3, href: "/app/liga-mx/teams/america" },
    { slug: "tigres-uanl", name: "Tigres UANL", shortName: "Tigres", rank: 4, href: "/app/liga-mx/teams/tigres-uanl" },
  ],
};

const NFL_PROFILE: TeamProfileData = {
  ...SOCCER_PROFILE,
  league: asLeagueId("nfl"),
  leagueLabel: "NFL",
  sport: "american-football",
  seasonLabel: "Temporada 2026",
  team: { id: "nfl.kansas-city-chiefs", slug: "kansas-city-chiefs", name: "Kansas City Chiefs", shortName: "Kansas City", code: "KC" },
  standing: null,
  venue: { name: "Arrowhead Stadium", elevationM: 251, roofType: "open" },
  injuries: [
    { player: "Rashee Rice", position: "WR", status: "Baja", detail: "Rodilla", reportedAt: "15 nov 2026" },
    { player: "Isiah Pacheco", position: "RB", status: "Cuestionable", detail: "Tobillo", reportedAt: "15 nov 2026" },
  ],
  recentAverages: {
    sampleGames: 8,
    scoredAvg: 26.4,
    concededAvg: 18.9,
    marginAvg: 7.5,
    cleanSheets: null,
    wins: 7,
    draws: 0,
    losses: 1,
    homeRecord: { games: 4, wins: 4, draws: 0, losses: 0, scoredAvg: 28.5, concededAvg: 17.0 },
    awayRecord: { games: 4, wins: 3, draws: 0, losses: 1, scoredAvg: 24.3, concededAvg: 20.8 },
    streak: ["G", "G", "P", "G", "G"],
  },
  modelSection: {
    locked: false,
    engineLabel: "Minkowski v3.0 · Eficiencia por jugada",
    sampleNote: "Calibración con 9 partidos registrados en la temporada vigente",
    updatedLabel: "15 nov 2026",
    metrics: [
      { id: "adj-for", label: "Ataque ajustado", value: "27.2 pts/p", detail: "Crudo: 26.4 pts/p", tone: "positive" },
      { id: "adj-against", label: "Defensa ajustada", value: "18.4 pts/p", detail: "Crudo permitido: 18.9 pts/p" },
      { id: "epa-off", label: "EPA ofensivo / jugada", value: "+0.118", detail: "Valor esperado añadido por jugada", tone: "positive" },
      { id: "epa-def", label: "EPA defensivo permitido", value: "-0.064", detail: "Negativo favorece a la defensa", tone: "positive" },
    ],
    unavailableReason: null,
  },
  upcomingFixtures: [
    {
      id: "nfl-kc-buf",
      gameHref: "/app/nfl/games/nfl-kc-buf",
      dateLabel: "dom, 22 nov",
      kickoffLocal: "15:25",
      round: "Semana 11",
      venue: "Arrowhead Stadium",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "buffalo-bills", name: "Buffalo Bills", shortName: "Buffalo", href: "/app/nfl/teams/buffalo-bills" },
      hasForecast: true,
      isRedacted: false,
      projectedTeamScore: 26.8,
      projectedOpponentScore: 23.4,
      winProbability: 0.61,
      confidenceLabel: "Confianza alta",
    },
  ],
  recentMatches: [
    {
      id: "nfl-m1",
      gameHref: null,
      date: "2026-11-08",
      dateLabel: "8 nov 2026",
      round: "Semana 9",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "new-york-jets", name: "New York Jets", shortName: "NY Jets", href: "/app/nfl/teams/new-york-jets" },
      teamScore: 35,
      opponentScore: 12,
      outcome: "G",
      resultNote: null,
    },
  ],
  relatedTeams: [
    { slug: "buffalo-bills", name: "Buffalo Bills", shortName: "Buffalo", rank: null, href: "/app/nfl/teams/buffalo-bills" },
  ],
};

const NBA_PROFILE: TeamProfileData = {
  ...NFL_PROFILE,
  league: asLeagueId("nba"),
  leagueLabel: "NBA",
  sport: "basketball",
  team: { id: "nba.denver-nuggets", slug: "denver-nuggets", name: "Denver Nuggets", shortName: "Nuggets", code: "DEN" },
  venue: { name: "Ball Arena", elevationM: 1609, roofType: "indoor_arena" },
  injuries: [],
  recentAverages: {
    sampleGames: 6,
    scoredAvg: 118.2,
    concededAvg: 111.5,
    marginAvg: 6.7,
    cleanSheets: null,
    wins: 4,
    draws: 0,
    losses: 2,
    homeRecord: { games: 3, wins: 3, draws: 0, losses: 0, scoredAvg: 121.0, concededAvg: 109.3 },
    awayRecord: { games: 3, wins: 1, draws: 0, losses: 2, scoredAvg: 115.3, concededAvg: 113.7 },
    streak: ["P", "G", "G", "P", "G"],
  },
  modelSection: {
    locked: false,
    engineLabel: "Motor NBA · Ritmo y eficiencia",
    sampleNote: "Calibración con 12 partidos registrados en la temporada vigente",
    updatedLabel: "15 nov 2026",
    metrics: [
      { id: "ortg", label: "Rating ofensivo (ORtg)", value: "118.4", detail: "Puntos por cada 100 posesiones", tone: "positive" },
      { id: "drtg", label: "Rating defensivo (DRtg)", value: "112.1", detail: "Puntos permitidos por 100 pos." },
      { id: "net", label: "Diferencial neto (Net Rtg)", value: "+6.3", detail: "Balance por 100 posesiones", tone: "positive" },
      { id: "pace", label: "Ritmo (Pace)", value: "99.4", detail: "Posesiones por 48 minutos" },
      { id: "srs", label: "Índice SRS ajustado", value: "+5.82", detail: "Margen ajustado por dificultad de rivales", tone: "brand" },
      { id: "efg", label: "Tiro efectivo (eFG%)", value: "56.1 %", detail: "Rival permitido: 53.0 %" },
    ],
    unavailableReason: null,
  },
  upcomingFixtures: [
    {
      id: "nba-den-bos",
      gameHref: "/app/nba/games/nba-den-bos",
      dateLabel: "dom, 22 nov",
      kickoffLocal: "19:30",
      round: "Temporada regular",
      venue: "Ball Arena",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "boston-celtics", name: "Boston Celtics", shortName: "Boston", href: "/app/nba/teams/boston-celtics" },
      hasForecast: true,
      isRedacted: false,
      projectedTeamScore: 116.4,
      projectedOpponentScore: 112.8,
      winProbability: 0.59,
      confidenceLabel: "Confianza media",
    },
  ],
  recentMatches: [
    {
      id: "nba-m1",
      gameHref: "/app/nba/games/nba-m1",
      date: "2026-11-13",
      dateLabel: "13 nov 2026",
      round: "Temporada regular",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "los-angeles-lakers", name: "Los Angeles Lakers", shortName: "LA Lakers", href: "/app/nba/teams/los-angeles-lakers" },
      teamScore: 124,
      opponentScore: 117,
      outcome: "G",
      resultNote: null,
    },
  ],
  relatedTeams: [
    { slug: "boston-celtics", name: "Boston Celtics", shortName: "Boston", rank: null, href: "/app/nba/teams/boston-celtics" },
    { slug: "oklahoma-city-thunder", name: "Oklahoma City Thunder", shortName: "Oklahoma City", rank: null, href: "/app/nba/teams/oklahoma-city-thunder" },
  ],
};

const NHL_PROFILE: TeamProfileData = {
  ...NBA_PROFILE,
  league: asLeagueId("nhl"),
  leagueLabel: "NHL",
  sport: "ice-hockey",
  team: { id: "nhl.carolina-hurricanes", slug: "carolina-hurricanes", name: "Carolina Hurricanes", shortName: "Hurricanes", code: "CAR" },
  venue: { name: "Lenovo Center", elevationM: 132, roofType: "indoor_arena" },
  recentAverages: {
    sampleGames: 8,
    scoredAvg: 3.75,
    concededAvg: 2.38,
    marginAvg: 1.37,
    cleanSheets: null,
    wins: 6,
    draws: 0,
    losses: 2,
    homeRecord: { games: 4, wins: 3, draws: 0, losses: 1, scoredAvg: 4.0, concededAvg: 2.0 },
    awayRecord: { games: 4, wins: 3, draws: 0, losses: 1, scoredAvg: 3.5, concededAvg: 2.75 },
    streak: ["G", "G", "P", "G", "G"],
  },
  modelSection: {
    locked: false,
    engineLabel: "Motor NHL · Peligro y posesión",
    sampleNote: "Calibración con 21 partidos registrados en la temporada vigente",
    updatedLabel: "15 nov 2026",
    metrics: [
      { id: "xg-pct", label: "Control de peligro (xG%)", value: "56.4 %", detail: "Proporción de goles esperados a favor", tone: "positive" },
      { id: "corsi", label: "Posesión de tiro (Corsi %)", value: "58.1 %", detail: "Volumen total de intentos al arco" },
      { id: "fenwick", label: "Tiros sin bloqueo (Fenwick %)", value: "57.2 %", detail: "Intentos que alcanzan zona de tiro" },
      { id: "hd-xg", label: "xG de alto peligro", value: "118.4", detail: "Ocasiones generadas frente a portería", tone: "brand" },
    ],
    unavailableReason: null,
  },
  upcomingFixtures: [
    {
      id: "nhl-car-nyr",
      gameHref: "/app/nhl/games/nhl-car-nyr",
      dateLabel: "dom, 22 nov",
      kickoffLocal: "18:00",
      round: "Temporada regular",
      venue: "Lenovo Center",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "new-york-rangers", name: "New York Rangers", shortName: "NY Rangers", href: "/app/nhl/teams/new-york-rangers" },
      hasForecast: true,
      isRedacted: false,
      projectedTeamScore: 3.4,
      projectedOpponentScore: 2.6,
      winProbability: 0.6,
      confidenceLabel: "Confianza alta",
    },
  ],
  recentMatches: [
    {
      id: "nhl-m1",
      gameHref: "/app/nhl/games/nhl-m1",
      date: "2026-11-14",
      dateLabel: "14 nov 2026",
      round: null,
      isHome: true,
      neutralSite: false,
      opponent: { slug: "florida-panthers", name: "Florida Panthers", shortName: "Panthers", href: "/app/nhl/teams/florida-panthers" },
      teamScore: 4,
      opponentScore: 3,
      outcome: "G",
      resultNote: "En prórroga",
    },
  ],
  relatedTeams: [
    { slug: "florida-panthers", name: "Florida Panthers", shortName: "Panthers", rank: null, href: "/app/nhl/teams/florida-panthers" },
    { slug: "new-york-rangers", name: "New York Rangers", shortName: "NY Rangers", rank: null, href: "/app/nhl/teams/new-york-rangers" },
  ],
};

const EMPTY_PROFILE: TeamProfileData = {
  ...NBA_PROFILE,
  team: { id: "nba.utah-jazz", slug: "utah-jazz", name: "Utah Jazz", shortName: "Jazz", code: "UTA" },
  venue: null,
  recentAverages: {
    sampleGames: 0,
    scoredAvg: null,
    concededAvg: null,
    marginAvg: null,
    cleanSheets: null,
    wins: 0,
    draws: 0,
    losses: 0,
    homeRecord: { games: 0, wins: 0, draws: 0, losses: 0, scoredAvg: null, concededAvg: null },
    awayRecord: { games: 0, wins: 0, draws: 0, losses: 0, scoredAvg: null, concededAvg: null },
    streak: [],
  },
  modelSection: {
    locked: false,
    engineLabel: "Motor NBA · Ritmo y eficiencia",
    sampleNote: null,
    updatedLabel: null,
    metrics: [],
    unavailableReason: "Este corte aún no incluye métricas ajustadas del modelo para este equipo.",
  },
  upcomingFixtures: [],
  recentMatches: [],
  relatedTeams: [],
};

function Shell({
  children,
  role = "member",
}: {
  children: React.ReactNode;
  role?: ViewerRole;
}): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole={role} allowRoleSimulation>
      {children}
    </PlatformProvider>
  );
}

export default {
  title: "PitchLab v4 / Perfiles de Equipo",
  parameters: { layout: "fullscreen" },
};

const dark = { globals: { theme: "dark" } };
const light = { globals: { theme: "light" } };

export const FutbolResumenOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={SOCCER_PROFILE} initialTab="resumen" />
    </Shell>
  ),
};
export const FutbolResumenClaro = { ...FutbolResumenOscuro, ...light };

export const FutbolPartidosOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={SOCCER_PROFILE} initialTab="partidos" />
    </Shell>
  ),
};
export const FutbolPartidosClaro = { ...FutbolPartidosOscuro, ...light };

export const NflConBajasOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={NFL_PROFILE} />
    </Shell>
  ),
};
export const NflConBajasClaro = { ...NflConBajasOscuro, ...light };

export const NbaSinEmpatesOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={NBA_PROFILE} />
    </Shell>
  ),
};
export const NbaSinEmpatesClaro = { ...NbaSinEmpatesOscuro, ...light };

export const NhlProrrogaOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={NHL_PROFILE} initialTab="partidos" />
    </Shell>
  ),
};
export const NhlProrrogaClaro = { ...NhlProrrogaOscuro, ...light };

export const VisitanteCeroFugaOscuro = {
  ...dark,
  render: () => (
    <Shell role="visitor">
      <TeamProfileClubView
        profile={{
          ...SOCCER_PROFILE,
          modelSection: {
            ...SOCCER_PROFILE.modelSection,
            locked: true,
            metrics: [],
          },
        }}
      />
    </Shell>
  ),
};
export const VisitanteCeroFugaClaro = { ...VisitanteCeroFugaOscuro, ...light };

export const EstadoVacioHonestoOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <TeamProfileClubView profile={EMPTY_PROFILE} />
    </Shell>
  ),
};
export const EstadoVacioHonestoClaro = { ...EstadoVacioHonestoOscuro, ...light };
