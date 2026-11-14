/**
 * Adaptador de 5DollarFootballAPI (v1) para córners, tarjetas y momios de Bet365.
 *
 * - `/leagues/{id}/fixtures?status=finished` trae en una sola llamada todos los partidos
 *   terminados de la ventana del plan, con goles, córners y tarjetas (también al medio tiempo).
 * - `/fixtures/{id}/odds` trae, en una llamada por partido, apertura y cierre de Bet365 para
 *   1X2, hándicap asiático, línea de goles, córners, tarjetas y ambos anotan.
 *
 * Plan gratis: top 5 de Europa, 3 meses de historia y 60 peticiones por hora. Liga MX
 * necesita Pro. En los planes de $0 la app debe mostrar «Football data by 5DollarFootballAPI».
 */
import { slugifyTeamName } from "../team-slug.js";
import type { ProviderClient } from "./http.js";

/** Ids de liga de 5Dollar por liga de PitchLab (`/v1/leagues`). */
export const FIVEDOLLAR_LEAGUES = {
  "premier-league": { id: 4160026622, freePlan: true },
  laliga: { id: 4212821298, freePlan: true },
  "serie-a": { id: 3405541143, freePlan: true },
  bundesliga: { id: 686337048, freePlan: true },
  "ligue-1": { id: 3614399544, freePlan: true },
  "liga-mx": { id: 2540173422, freePlan: false },
} as const;

export type FiveDollarLeagueKey = keyof typeof FIVEDOLLAR_LEAGUES;

/** Pausa entre peticiones para no pasar el límite de cada plan. */
export function fiveDollarIntervalMs(plan: string): number {
  switch (plan.toLowerCase()) {
    case "ultra":
      return 1_600; // 40/min
    case "pro":
    case "education":
      return 6_100; // 10/min
    case "community":
      return 12_100; // 300/h
    default:
      return 60_500; // free: 60/h
  }
}

// ---------- Formas de la API ----------

interface FdSide {
  id: number;
  name: string;
}

export interface FdFixture {
  id: number;
  league: { id: number; name?: string };
  teams: { home: FdSide; away: FdSide };
  kickoff_utc: string;
  status: string;
  status_code?: string | null;
  goals?: { home?: number | null; away?: number | null; half_home?: number | null; half_away?: number | null } | null;
  corners?: { home?: number | null; away?: number | null; half_home?: number | null; half_away?: number | null } | null;
  cards?: {
    home?: { yellow?: number | null; red?: number | null } | null;
    away?: { yellow?: number | null; red?: number | null } | null;
  } | null;
}

export interface FdEnvelope<T> {
  success: number | boolean;
  data: T;
  pagination?: { page: number; per_page: number; count: number; has_more: boolean };
}

type Price = Record<string, number | string | null | undefined>;
interface FdMarket {
  opening?: Price | null;
  closing?: Price | null;
}

export interface FdOddsData {
  fixture_id: number;
  bookmakers: { name: string; slug: string; odds: Record<string, FdMarket | unknown> }[];
}

// ---------- Filas normalizadas ----------

export interface OddsPair<T> {
  opening: T | null;
  closing: T | null;
}

export interface ThreeWay {
  home: number;
  draw: number;
  away: number;
}
export interface TwoWayLine {
  line: number;
  over: number;
  under: number;
}
export interface HandicapLine {
  line: number;
  home: number;
  away: number;
}

export interface FiveDollarOdds {
  bookmaker: string;
  oneXTwo: OddsPair<ThreeWay>;
  asianHandicap: OddsPair<HandicapLine>;
  goalLine: OddsPair<TwoWayLine>;
  cornerLine: OddsPair<TwoWayLine>;
  cardLine: OddsPair<TwoWayLine>;
  btts: OddsPair<{ yes: number; no: number }>;
}

export interface FiveDollarMatchRow {
  source: "fivedollar";
  league: FiveDollarLeagueKey;
  providerMatchId: number;
  providerLeagueId: number;
  kickoffUtc: string;
  status: string;
  home: { providerTeamId: number; name: string; slug: string };
  away: { providerTeamId: number; name: string; slug: string };
  goals: { home: number | null; away: number | null; htHome: number | null; htAway: number | null };
  corners: { home: number | null; away: number | null; htHome: number | null; htAway: number | null };
  cards: { homeYellow: number | null; homeRed: number | null; awayYellow: number | null; awayRed: number | null };
  odds: FiveDollarOdds | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function price(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 1 ? n : null;
}

function pick<T>(market: unknown, build: (p: Price) => T | null): OddsPair<T> {
  const m = (market ?? {}) as FdMarket;
  return {
    opening: m.opening ? build(m.opening) : null,
    closing: m.closing ? build(m.closing) : null,
  };
}

const threeWay = (p: Price): ThreeWay | null => {
  const home = price(p.home);
  const draw = price(p.draw);
  const away = price(p.away);
  return home && draw && away ? { home, draw, away } : null;
};
const overUnder = (p: Price): TwoWayLine | null => {
  const line = num(p.line);
  const over = price(p.over);
  const under = price(p.under);
  return line !== null && over && under ? { line, over, under } : null;
};
const handicap = (p: Price): HandicapLine | null => {
  const line = num(p.line);
  const home = price(p.home);
  const away = price(p.away);
  return line !== null && home && away ? { line, home, away } : null;
};
const yesNo = (p: Price): { yes: number; no: number } | null => {
  const yes = price(p.yes);
  const no = price(p.no);
  return yes && no ? { yes, no } : null;
};

export function parseOdds(data: FdOddsData | null, bookmaker = "bet365"): FiveDollarOdds | null {
  const book = data?.bookmakers.find((b) => b.slug === bookmaker);
  if (!book) return null;
  const o = book.odds;
  return {
    bookmaker: book.slug,
    oneXTwo: pick(o["1x2"], threeWay),
    asianHandicap: pick(o.asian_handicap, handicap),
    goalLine: pick(o.goal_line, overUnder),
    cornerLine: pick(o.corner_line, overUnder),
    cardLine: pick(o.card_line, overUnder),
    btts: pick(o.btts, yesNo),
  };
}

export function toMatchRow(
  league: FiveDollarLeagueKey,
  fixture: FdFixture,
  odds: FiveDollarOdds | null,
): FiveDollarMatchRow {
  return {
    source: "fivedollar",
    league,
    providerMatchId: fixture.id,
    providerLeagueId: fixture.league.id,
    kickoffUtc: fixture.kickoff_utc,
    status: fixture.status,
    home: {
      providerTeamId: fixture.teams.home.id,
      name: fixture.teams.home.name,
      slug: slugifyTeamName(fixture.teams.home.name),
    },
    away: {
      providerTeamId: fixture.teams.away.id,
      name: fixture.teams.away.name,
      slug: slugifyTeamName(fixture.teams.away.name),
    },
    goals: {
      home: num(fixture.goals?.home),
      away: num(fixture.goals?.away),
      htHome: num(fixture.goals?.half_home),
      htAway: num(fixture.goals?.half_away),
    },
    corners: {
      home: num(fixture.corners?.home),
      away: num(fixture.corners?.away),
      htHome: num(fixture.corners?.half_home),
      htAway: num(fixture.corners?.half_away),
    },
    cards: {
      homeYellow: num(fixture.cards?.home?.yellow),
      homeRed: num(fixture.cards?.home?.red),
      awayYellow: num(fixture.cards?.away?.yellow),
      awayRed: num(fixture.cards?.away?.red),
    },
    odds,
  };
}

// ---------- Recolección ----------

export async function listFinishedFixtures(
  client: ProviderClient,
  league: FiveDollarLeagueKey,
): Promise<FdFixture[]> {
  const leagueId = FIVEDOLLAR_LEAGUES[league].id;
  const fixtures: FdFixture[] = [];
  for (let page = 1; page <= 50; page++) {
    // La ventana del plan avanza cada día: la lista se pide fresca.
    const res = await client.get<FdEnvelope<FdFixture[]>>(
      `/leagues/${leagueId}/fixtures?status=finished&per_page=100&order=desc&page=${page}`,
      { cache: false },
    );
    if (!res?.data) break;
    fixtures.push(...res.data);
    if (!res.pagination?.has_more) break;
  }
  return fixtures;
}

export interface CollectLeagueOptions {
  /** Momios nuevos a pedir en esta corrida (1 petición cada uno; los de caché no cuentan). */
  readonly maxOddsRequests: number;
}

export async function collectLeague(
  client: ProviderClient,
  league: FiveDollarLeagueKey,
  options: CollectLeagueOptions,
): Promise<{ rows: FiveDollarMatchRow[]; oddsFetched: number; oddsPending: number }> {
  const fixtures = await listFinishedFixtures(client, league);
  const rows: FiveDollarMatchRow[] = [];
  let oddsFetched = 0;
  let oddsPending = 0;
  for (const fixture of fixtures) {
    const path = `/fixtures/${fixture.id}/odds`;
    let odds: FiveDollarOdds | null = null;
    const cached = client.isCached(path);
    if (cached || oddsFetched < options.maxOddsRequests) {
      const res = await client.get<FdEnvelope<FdOddsData>>(path);
      odds = parseOdds(res?.data ?? null);
      if (!cached) oddsFetched += 1;
    } else {
      oddsPending += 1;
    }
    rows.push(toMatchRow(league, fixture, odds));
  }
  return { rows, oddsFetched, oddsPending };
}
