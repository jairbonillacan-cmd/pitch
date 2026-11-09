import type { MatchAnalysis, StandingRow } from "@pitchlab/contracts";

export interface HomeLeague {
  id: string;
  label: string;
}

export interface HomeSearchMatch {
  id: string;
  href: string;
  league: string;
  leagueLabel: string;
  matchup: string;
  date: string;
  time: string;
}

export interface HomeFixture extends HomeSearchMatch {
  sport: MatchAnalysis["sport"];
  round: string;
  home: Pick<MatchAnalysis["home"], "slug" | "name" | "shortName">;
  away: Pick<MatchAnalysis["away"], "slug" | "name" | "shortName">;
}

export interface HomeMatch extends HomeFixture {
  outcome: {
    label: string;
    team?: HomeFixture["home"];
    p: number;
    fairOdds: number;
  };
  runnerUp?: { label: string; p: number };
}

export type HomeMatchPreview = HomeFixture & Partial<Pick<HomeMatch, "outcome" | "runnerUp">>;

export interface AppHomeData {
  dayLabel: string;
  asOf?: string;
  isStale: boolean;
  hasErrors: boolean;
  leagues: HomeLeague[];
  ranked: HomeMatch[];
  upcoming: HomeMatchPreview[];
  tonight?: HomeMatchPreview;
  standings: StandingRow[];
  searchMatches: HomeSearchMatch[];
}

export interface HomeSnapshot {
  league: string;
  leagueLabel: string;
  generatedAt: string;
  games: readonly MatchAnalysis[];
  standings?: StandingRow[];
}

const timeZone = "America/Mexico_City";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" });
const dayLabel = new Intl.DateTimeFormat("es-MX", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDate = new Intl.DateTimeFormat("es-MX", {
  timeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const clock = new Intl.DateTimeFormat("es-MX", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kickoffInMexico(game: MatchAnalysis): Date {
  const start = game.kickoffUtc;
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(start)) return new Date(start);
  // Los snapshots antiguos publican la hora de cartelera sin offset.
  const local = start.length === 10 ? `${start}T15:00:00` : start;
  return new Date(`${local}-06:00`);
}

function mostLikely(game: MatchAnalysis, fixture: HomeFixture): HomeMatch | undefined {
  if (!game.publicationLabel) return undefined;
  const [first, second] = (game.marketGroups?.[0]?.rows ?? [])
    .filter((row) => row.market === "h2h" && row.p > 0)
    .sort((a, b) => b.p - a.p);
  if (!first) return undefined;
  const team = first.selection === "home" ? fixture.home : first.selection === "away" ? fixture.away : undefined;
  return {
    ...fixture,
    outcome: {
      label: team ? `Victoria de ${team.name}` : first.label,
      team,
      p: first.p,
      fairOdds: first.fairOdds,
    },
    runnerUp: second ? {
      label: second.selection === "home" ? game.home.name :
        second.selection === "away" ? game.away.name : second.label,
      p: second.p,
    } : undefined,
  };
}

function isUpcoming(game: MatchAnalysis, kickoff: Date, now: Date): boolean {
  return (game.scheduleStatus ? game.scheduleStatus === "scheduled" : game.status === "NS")
    && kickoff > now;
}

export function buildAppHome(
  snapshots: readonly HomeSnapshot[],
  now: Date,
  hasErrors = false,
): AppHomeData {
  const today = dayKey.format(now);
  const games = snapshots.flatMap(({ games }) => games.flatMap((game) => {
    const kickoff = kickoffInMexico(game);
    if (!Number.isFinite(kickoff.getTime())) return [];
    const match: HomeSearchMatch = {
      id: game.id,
      href: `/app/${game.league}/games/${encodeURIComponent(game.id)}`,
      league: game.league,
      leagueLabel: game.leagueLabel,
      matchup: `${game.home.name} vs ${game.away.name}`,
      date: shortDate.format(kickoff).replaceAll(" de ", " "),
      time: clock.format(kickoff),
    };
    return [{ game, kickoff, match }];
  })).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  const upcomingGames = games.flatMap(({ game, kickoff, match }) => {
    if (!isUpcoming(game, kickoff, now)) return [];
    const fixture: HomeFixture = {
      ...match,
      sport: game.sport,
      round: game.round,
      home: { slug: game.home.slug, name: game.home.name, shortName: game.home.shortName },
      away: { slug: game.away.slug, name: game.away.name, shortName: game.away.shortName },
    };
    return [{ kickoff, match, fixture, prediction: mostLikely(game, fixture) }];
  });
  const upcoming = upcomingGames.map(({ prediction, fixture }) => prediction ?? fixture);
  const firstToday = upcomingGames.find(({ kickoff }) => dayKey.format(kickoff) === today);
  const ranked = upcomingGames.flatMap(({ prediction }) => prediction ?? [])
    .sort((a, b) => b.outcome.p - a.outcome.p).slice(0, 4);
  const visibleLeagues = new Set(upcoming.map(({ league }) => league));
  const sources = snapshots.filter(({ league }) => visibleLeagues.has(league) || league === "liga-mx");
  const asOf = (sources.length ? sources : snapshots)
    .map(({ generatedAt }) => generatedAt)
    .filter((timestamp) => Number.isFinite(Date.parse(timestamp)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return {
    dayLabel: dayLabel.format(now),
    asOf,
    isStale: asOf !== undefined && now.getTime() - Date.parse(asOf) > 86_400_000,
    hasErrors,
    leagues: snapshots.map(({ league, leagueLabel }) => ({ id: league, label: leagueLabel })),
    ranked,
    upcoming,
    tonight: firstToday?.prediction ?? firstToday?.fixture,
    standings: snapshots.find(({ league }) => league === "liga-mx")?.standings ?? [],
    searchMatches: [
      ...upcomingGames.map(({ match }) => match),
      ...games.filter(({ game, kickoff }) => !isUpcoming(game, kickoff, now))
        .reverse()
        .map(({ match }) => match),
    ],
  };
}
