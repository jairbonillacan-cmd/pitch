import { asLeagueId, type LeagueId } from "./ids";
import { getLeagueCapability } from "./league-capabilities.js";
import type { PlatformSport } from "./view-models";

export type LeagueRegionKey =
  | "north-america"
  | "intl-club-cups"
  | "europe-top5"
  | "europe-top5-cups"
  | "europe-other"
  | "south-america"
  | "middle-east-asia"
  | "national-teams"
  | "us-sports";

export interface LeagueRegionDef {
  readonly key: LeagueRegionKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly sport: "football" | "us-sports";
}

export const LEAGUE_REGIONS: readonly LeagueRegionDef[] = [
  { key: "north-america", label: "Norteamérica y CONCACAF", shortLabel: "CONCACAF", sport: "football" },
  { key: "intl-club-cups", label: "Copas internacionales", shortLabel: "Copas intl.", sport: "football" },
  { key: "europe-top5", label: "Top 5 Europa", shortLabel: "Top 5 Europa", sport: "football" },
  { key: "south-america", label: "Sudamérica", shortLabel: "Sudamérica", sport: "football" },
  { key: "europe-top5-cups", label: "Copas y 2.ª Europa", shortLabel: "Copas / 2.ª", sport: "football" },
  { key: "europe-other", label: "Otras ligas europeas", shortLabel: "Europa", sport: "football" },
  { key: "middle-east-asia", label: "Medio Oriente y Asia", shortLabel: "Asia / M.O.", sport: "football" },
  { key: "national-teams", label: "Selecciones", shortLabel: "Selecciones", sport: "football" },
  { key: "us-sports", label: "Deportes EE. UU.", shortLabel: "EE. UU.", sport: "us-sports" },
] as const;

export interface CompetitionMeta {
  readonly id: LeagueId;
  readonly label: string;
  readonly shortLabel: string;
  readonly sport: PlatformSport;
  readonly region: LeagueRegionKey;
  readonly country: string;
  readonly countrySlug: string | null;
  readonly season: string;
  readonly defaultPeriod: string;
  readonly bzzoiroId?: number;
  readonly espnSoccerSlug?: string;
  readonly isKnockoutCup?: boolean;
  readonly prestigeTier: 1 | 2 | 3 | 4;
}

const L = (
  id: Parameters<typeof asLeagueId>[0],
  meta: Omit<CompetitionMeta, "id">,
): CompetitionMeta => ({
  id: asLeagueId(id),
  ...meta,
});

export const COMPETITION_CATALOG: readonly CompetitionMeta[] = [
  L("liga-mx", { label: "Liga MX", shortLabel: "Liga MX", sport: "football", region: "north-america", country: "México", countrySlug: "mexico", season: "Apertura 2026", defaultPeriod: "Jornada regular", bzzoiroId: 19, prestigeTier: 1 }),
  L("mls", { label: "MLS", shortLabel: "MLS", sport: "football", region: "north-america", country: "Estados Unidos", countrySlug: "estados-unidos", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 18, prestigeTier: 2 }),
  L("concacaf-champions", { label: "CONCACAF Champions Cup", shortLabel: "Concachampions", sport: "football", region: "north-america", country: "CONCACAF", countrySlug: null, season: "2026", defaultPeriod: "Fase final", espnSoccerSlug: "concacaf.champions", isKnockoutCup: true, prestigeTier: 1 }),
  L("leagues-cup", { label: "Leagues Cup", shortLabel: "Leagues Cup", sport: "football", region: "north-america", country: "Norteamérica", countrySlug: null, season: "2026", defaultPeriod: "Fase de grupos y KO", espnSoccerSlug: "concacaf.leagues.cup", isKnockoutCup: true, prestigeTier: 2 }),

  L("champions-league", { label: "UEFA Champions League", shortLabel: "Champions", sport: "football", region: "intl-club-cups", country: "Europa", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de liga", bzzoiroId: 7, prestigeTier: 1 }),
  L("europa-league", { label: "UEFA Europa League", shortLabel: "Europa League", sport: "football", region: "intl-club-cups", country: "Europa", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de liga", bzzoiroId: 8, prestigeTier: 2 }),
  L("conference-league", { label: "UEFA Conference League", shortLabel: "Conference", sport: "football", region: "intl-club-cups", country: "Europa", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de liga", bzzoiroId: 83, prestigeTier: 3 }),
  L("uefa-super-cup", { label: "UEFA Super Cup", shortLabel: "Supercopa UEFA", sport: "football", region: "intl-club-cups", country: "Europa", countrySlug: null, season: "2026", defaultPeriod: "Final", bzzoiroId: 90, isKnockoutCup: true, prestigeTier: 2 }),
  L("libertadores", { label: "Copa Libertadores", shortLabel: "Libertadores", sport: "football", region: "intl-club-cups", country: "Sudamérica", countrySlug: null, season: "2026", defaultPeriod: "Fase final", bzzoiroId: 32, prestigeTier: 1 }),
  L("sudamericana", { label: "Copa Sudamericana", shortLabel: "Sudamericana", sport: "football", region: "intl-club-cups", country: "Sudamérica", countrySlug: null, season: "2026", defaultPeriod: "Fase final", bzzoiroId: 33, prestigeTier: 2 }),
  L("caf-champions", { label: "CAF Champions League", shortLabel: "CAF Champions", sport: "football", region: "intl-club-cups", country: "África", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de grupos", bzzoiroId: 29, prestigeTier: 3 }),

  L("premier-league", { label: "Premier League", shortLabel: "Premier", sport: "football", region: "europe-top5", country: "Inglaterra", countrySlug: "inglaterra", season: "2026/27", defaultPeriod: "Jornada regular", bzzoiroId: 1, prestigeTier: 1 }),
  L("laliga", { label: "LaLiga", shortLabel: "LaLiga", sport: "football", region: "europe-top5", country: "España", countrySlug: "espana", season: "2026/27", defaultPeriod: "Jornada regular", bzzoiroId: 3, prestigeTier: 1 }),
  L("bundesliga", { label: "Bundesliga", shortLabel: "Bundesliga", sport: "football", region: "europe-top5", country: "Alemania", countrySlug: "alemania", season: "2026/27", defaultPeriod: "Jornada regular", bzzoiroId: 5, prestigeTier: 2 }),
  L("serie-a", { label: "Serie A", shortLabel: "Serie A", sport: "football", region: "europe-top5", country: "Italia", countrySlug: "italia", season: "2026/27", defaultPeriod: "Jornada regular", bzzoiroId: 4, prestigeTier: 2 }),
  L("ligue-1", { label: "Ligue 1", shortLabel: "Ligue 1", sport: "football", region: "europe-top5", country: "Francia", countrySlug: "francia", season: "2026/27", defaultPeriod: "Jornada regular", bzzoiroId: 6, prestigeTier: 2 }),

  L("liga-argentina", { label: "Liga Profesional Argentina", shortLabel: "Argentina", sport: "football", region: "south-america", country: "Argentina", countrySlug: "argentina", season: "2026", defaultPeriod: "Torneo 2026", bzzoiroId: 85, prestigeTier: 2 }),
  L("brasileirao", { label: "Brasileirão Serie A", shortLabel: "Brasileirão", sport: "football", region: "south-america", country: "Brasil", countrySlug: "brasil", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 9, prestigeTier: 2 }),
  L("brasileirao-b", { label: "Brasileirão Serie B", shortLabel: "Serie B BR", sport: "football", region: "south-america", country: "Brasil", countrySlug: "brasil", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 34, prestigeTier: 3 }),
  L("copa-do-brasil", { label: "Copa do Brasil", shortLabel: "Copa do Brasil", sport: "football", region: "south-america", country: "Brasil", countrySlug: "brasil", season: "2026", defaultPeriod: "Eliminatorias", bzzoiroId: 35, isKnockoutCup: true, prestigeTier: 2 }),
  L("primera-a-colombia", { label: "Categoría Primera A", shortLabel: "Colombia", sport: "football", region: "south-america", country: "Colombia", countrySlug: "colombia", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 80, prestigeTier: 3 }),
  L("copa-colombia", { label: "Copa Colombia", shortLabel: "Copa Colombia", sport: "football", region: "south-america", country: "Colombia", countrySlug: "colombia", season: "2026", defaultPeriod: "Eliminatorias", bzzoiroId: 81, isKnockoutCup: true, prestigeTier: 4 }),
  L("primera-chile", { label: "Liga de Primera", shortLabel: "Chile", sport: "football", region: "south-america", country: "Chile", countrySlug: "chile", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 111, prestigeTier: 3 }),
  L("ligapro-ecuador", { label: "LigaPro Serie A", shortLabel: "Ecuador", sport: "football", region: "south-america", country: "Ecuador", countrySlug: "ecuador", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 112, prestigeTier: 3 }),
  L("liga-1-peru", { label: "Liga 1 Perú", shortLabel: "Perú", sport: "football", region: "south-america", country: "Perú", countrySlug: "peru", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 113, prestigeTier: 3 }),

  L("championship", { label: "EFL Championship", shortLabel: "Championship", sport: "football", region: "europe-top5-cups", country: "Inglaterra", countrySlug: "inglaterra", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 12, prestigeTier: 3 }),
  L("fa-cup", { label: "FA Cup", shortLabel: "FA Cup", sport: "football", region: "europe-top5-cups", country: "Inglaterra", countrySlug: "inglaterra", season: "2026/27", defaultPeriod: "Rondas eliminatorias", bzzoiroId: 39, isKnockoutCup: true, prestigeTier: 2 }),
  L("carabao-cup", { label: "Carabao Cup", shortLabel: "Carabao Cup", sport: "football", region: "europe-top5-cups", country: "Inglaterra", countrySlug: "inglaterra", season: "2026/27", defaultPeriod: "Rondas eliminatorias", bzzoiroId: 40, isKnockoutCup: true, prestigeTier: 3 }),
  L("segunda-espana", { label: "LaLiga Hypermotion", shortLabel: "Segunda ES", sport: "football", region: "europe-top5-cups", country: "España", countrySlug: "espana", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 38, prestigeTier: 3 }),
  L("copa-del-rey", { label: "Copa del Rey", shortLabel: "Copa del Rey", sport: "football", region: "europe-top5-cups", country: "España", countrySlug: "espana", season: "2026/27", defaultPeriod: "Eliminatorias", bzzoiroId: 41, isKnockoutCup: true, prestigeTier: 2 }),
  L("liga-f", { label: "Liga F", shortLabel: "Liga F", sport: "football", region: "europe-top5-cups", country: "España", countrySlug: "espana", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 36, prestigeTier: 3 }),
  L("bundesliga-2", { label: "2. Bundesliga", shortLabel: "2. Bundesliga", sport: "football", region: "europe-top5-cups", country: "Alemania", countrySlug: "alemania", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 94, prestigeTier: 3 }),
  L("dfb-pokal", { label: "DFB-Pokal", shortLabel: "DFB-Pokal", sport: "football", region: "europe-top5-cups", country: "Alemania", countrySlug: "alemania", season: "2026/27", defaultPeriod: "Eliminatorias", bzzoiroId: 43, isKnockoutCup: true, prestigeTier: 2 }),
  L("serie-b", { label: "Serie B Italia", shortLabel: "Serie B", sport: "football", region: "europe-top5-cups", country: "Italia", countrySlug: "italia", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 100, prestigeTier: 3 }),
  L("coppa-italia", { label: "Coppa Italia", shortLabel: "Coppa Italia", sport: "football", region: "europe-top5-cups", country: "Italia", countrySlug: "italia", season: "2026/27", defaultPeriod: "Eliminatorias", bzzoiroId: 42, isKnockoutCup: true, prestigeTier: 2 }),
  L("ligue-2", { label: "Ligue 2", shortLabel: "Ligue 2", sport: "football", region: "europe-top5-cups", country: "Francia", countrySlug: "francia", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 89, prestigeTier: 3 }),
  L("coupe-de-france", { label: "Coupe de France", shortLabel: "Coupe France", sport: "football", region: "europe-top5-cups", country: "Francia", countrySlug: "francia", season: "2026/27", defaultPeriod: "Eliminatorias", bzzoiroId: 44, isKnockoutCup: true, prestigeTier: 3 }),

  L("eredivisie", { label: "Eredivisie", shortLabel: "Eredivisie", sport: "football", region: "europe-other", country: "Países Bajos", countrySlug: "paises-bajos", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 10, prestigeTier: 2 }),
  L("liga-portugal", { label: "Liga Portugal Betclic", shortLabel: "Liga Portugal", sport: "football", region: "europe-other", country: "Portugal", countrySlug: "portugal", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 2, prestigeTier: 2 }),
  L("pro-league-belgica", { label: "Pro League Bélgica", shortLabel: "Bélgica", sport: "football", region: "europe-other", country: "Bélgica", countrySlug: "belgica", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 14, prestigeTier: 3 }),
  L("super-lig", { label: "Süper Lig", shortLabel: "Süper Lig", sport: "football", region: "europe-other", country: "Turquía", countrySlug: "turquia", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 11, prestigeTier: 3 }),

  L("saudi-pro-league", { label: "Saudi Pro League", shortLabel: "Saudi Pro", sport: "football", region: "middle-east-asia", country: "Arabia Saudita", countrySlug: "arabia-saudita", season: "2026/27", defaultPeriod: "Temporada 2026/27", bzzoiroId: 17, prestigeTier: 2 }),
  L("j1-league", { label: "J1 League", shortLabel: "J1 League", sport: "football", region: "middle-east-asia", country: "Japón", countrySlug: "japon", season: "2026", defaultPeriod: "Temporada 2026", bzzoiroId: 49, prestigeTier: 3 }),

  L("concacaf-nations", { label: "Concacaf Nations League", shortLabel: "Concacaf NL", sport: "football", region: "national-teams", country: "CONCACAF", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de ligas", prestigeTier: 2 }),
  L("uefa-nations", { label: "UEFA Nations League", shortLabel: "UEFA NL", sport: "football", region: "national-teams", country: "Europa", countrySlug: null, season: "2026/27", defaultPeriod: "Fase de ligas", prestigeTier: 2 }),
  L("amistosos", { label: "Amistosos FIFA", shortLabel: "Amistosos", sport: "football", region: "national-teams", country: "Internacional", countrySlug: null, season: "2026", defaultPeriod: "Fecha FIFA", prestigeTier: 3 }),
  L("copa-del-mundo", { label: "Copa del Mundo FIFA", shortLabel: "Mundial", sport: "football", region: "national-teams", country: "FIFA", countrySlug: null, season: "2026", defaultPeriod: "Torneo 2026", prestigeTier: 1 }),
  L("eliminatorias", { label: "Eliminatorias Mundialistas", shortLabel: "Eliminatorias", sport: "football", region: "national-teams", country: "FIFA", countrySlug: null, season: "2025–26", defaultPeriod: "Clasificación", prestigeTier: 2 }),
  L("copa-america", { label: "Copa América", shortLabel: "Copa América", sport: "football", region: "national-teams", country: "CONMEBOL", countrySlug: null, season: "2024", defaultPeriod: "Fase final", prestigeTier: 1 }),
  L("eurocopa", { label: "Eurocopa UEFA", shortLabel: "Eurocopa", sport: "football", region: "national-teams", country: "UEFA", countrySlug: null, season: "2024", defaultPeriod: "Fase final", prestigeTier: 1 }),
  L("copa-oro", { label: "Copa Oro Concacaf", shortLabel: "Copa Oro", sport: "football", region: "national-teams", country: "CONCACAF", countrySlug: null, season: "2025", defaultPeriod: "Fase final", prestigeTier: 2 }),
  L("copa-africana", { label: "Copa Africana de Naciones", shortLabel: "AFCON", sport: "football", region: "national-teams", country: "CAF", countrySlug: null, season: "2025/26", defaultPeriod: "Fase final", prestigeTier: 3 }),
  L("copa-asiatica", { label: "Copa Asiática AFC", shortLabel: "Copa Asiática", sport: "football", region: "national-teams", country: "AFC", countrySlug: null, season: "2026/27", defaultPeriod: "Fase final", prestigeTier: 3 }),

  L("nfl", { label: "NFL", shortLabel: "NFL", sport: "american-football", region: "us-sports", country: "Estados Unidos", countrySlug: "estados-unidos", season: "2026", defaultPeriod: "Temporada 2026", prestigeTier: 1 }),
  L("nba", { label: "NBA", shortLabel: "NBA", sport: "basketball", region: "us-sports", country: "Estados Unidos", countrySlug: "estados-unidos", season: "2026-27", defaultPeriod: "Temporada 2026-27", prestigeTier: 1 }),
  L("nhl", { label: "NHL", shortLabel: "NHL", sport: "ice-hockey", region: "us-sports", country: "Estados Unidos", countrySlug: "estados-unidos", season: "2026-27", defaultPeriod: "Temporada 2026-27", prestigeTier: 2 }),
  L("mlb", { label: "MLB", shortLabel: "MLB", sport: "baseball", region: "us-sports", country: "Estados Unidos", countrySlug: "estados-unidos", season: "2026", defaultPeriod: "Temporada 2026", prestigeTier: 1 }),
];

export const COMPETITION_BY_ID: Readonly<Record<string, CompetitionMeta>> = Object.fromEntries(
  COMPETITION_CATALOG.map((c) => [c.id, c]),
);

export const BZZOIRO_EXPANSION_COMPETITIONS: readonly CompetitionMeta[] = COMPETITION_CATALOG.filter(
  (c) => {
    const capability = getLeagueCapability(c.id);
    return (
      typeof c.bzzoiroId === "number" &&
      capability !== undefined &&
      capability.sport === "football" &&
      capability.tier !== "tier1_core"
    );
  },
);

export function getCompetitionMeta(league: string): CompetitionMeta | undefined {
  return COMPETITION_BY_ID[league];
}

export function isKnockoutCupCompetition(league: string): boolean {
  return Boolean(COMPETITION_BY_ID[league]?.isKnockoutCup);
}

export function competitionPrestigeScore(league: string): number {
  const tier = COMPETITION_BY_ID[league]?.prestigeTier ?? 4;
  if (tier === 1) return 140;
  if (tier === 2) return 105;
  if (tier === 3) return 70;
  return 40;
}

export function isLeagueActiveInWindow(
  games: ReadonlyArray<{ league: string; status: string; dayId?: string; kickoffUtc?: string }>,
  league: string,
  todayIso: string,
  windowDays = 30,
): boolean {
  const startDate = new Date(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) {
    return games.some((g) => g.league === league && g.status !== "FT");
  }
  const yesterdayIso = new Date(startDate.getTime() - 86_400_000).toISOString().slice(0, 10);
  const endIso = new Date(startDate.getTime() + windowDays * 86_400_000).toISOString().slice(0, 10);

  for (const g of games) {
    if (g.league !== league) continue;
    if (g.status === "LIVE" || g.status === "in_progress") return true;
    if (g.status === "FT" || g.status === "final") continue;
    const day = g.dayId || (g.kickoffUtc ? g.kickoffUtc.slice(0, 10) : "");
    if (day && day >= yesterdayIso && day <= endIso) return true;
  }
  return false;
}
