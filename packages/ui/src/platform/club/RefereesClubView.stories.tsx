import React, { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmblemSurfaceProvider } from "../../sports";
import { redactDatasetForVisitor } from "../access-guard";
import { useSafeEffect } from "../hooks";
import { PlatformProvider } from "../platform-provider";
import { STORY_DATASET } from "../story-fixtures";
import {
  RefereesClubView,
  type LeagueRefereeRankingData,
  type RefereeLeagueLinkOption,
  type RefereeProfileData,
} from "./RefereesClubView";

const meta = {
  title: "Platform v4 / Club / RefereesClubView",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const VISITOR_DATASET = redactDatasetForVisitor(STORY_DATASET);

const AVAILABLE_LEAGUES: readonly RefereeLeagueLinkOption[] = [
  { id: "liga-mx", label: "Liga MX", href: "/app/liga-mx/arbitros" },
  { id: "premier-league", label: "Premier League", href: "/app/premier-league/arbitros" },
  { id: "laliga", label: "LaLiga", href: "/app/laliga/arbitros" },
];

const LIGA_MX_REFEREE_RANKING: LeagueRefereeRankingData = {
  league: "liga-mx",
  leagueLabel: "Liga MX",
  season: "Apertura 2026",
  updatedAt: "2026-11-21T18:00:00Z",
  kappa: 15,
  leagueMeanYellow: 4.42,
  leagueMeanRed: 0.24,
  leagueMeanPenalties: 0.31,
  totalReferees: 5,
  referees: [
    {
      slug: "cesar-ramos",
      name: "César Ramos",
      country: "México",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      href: "/app/liga-mx/r/cesar-ramos",
      matches: 32,
      sampleGamesObserved: 32,
      avgYellow: 5.42,
      ebYellow: 5.18,
      avgRed: 0.34,
      ebRed: 0.31,
      avgPenalties: 0.41,
      ebPenalties: 0.38,
      avgFouls: 24.6,
      avgGoals: 2.75,
      leagueMeanYellow: 4.42,
      leagueMeanRed: 0.24,
      leagueMeanPenalties: 0.31,
      tier: "estricto",
      tierLabel: "Estricto",
      rigorPercentile: 89,
      rank: 1,
      totalInLeague: 5,
      lastMatch: {
        matchSlug: "cruz-azul-vs-monterrey-84a21c",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        dateIso: "2026-11-15T01:00:00Z",
        dateLabel: "14 nov",
        round: "Jornada 15",
        homeTeam: "Cruz Azul",
        awayTeam: "Monterrey",
        homeSlug: "cruz-azul",
        awaySlug: "monterrey",
        score: { home: 2, away: 1 },
        status: "FT",
        href: "/app/liga-mx/g/cruz-azul-vs-monterrey-84a21c",
      },
      nextAssignment: {
        matchSlug: "club-america-vs-tigres-uanl-91c40e",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        kickoffUtc: "2026-11-23T03:00:00Z",
        dateLabel: "Dom 22 · 21:00",
        round: "Jornada 16",
        venue: "Estadio Azteca",
        homeTeam: "Club América",
        homeSlug: "club-america",
        awayTeam: "Tigres UANL",
        awaySlug: "tigres-uanl",
        status: "NS",
        href: "/app/liga-mx/g/club-america-vs-tigres-uanl-91c40e",
      },
    },
    {
      slug: "marco-antonio-ortiz",
      name: "Marco Antonio Ortiz",
      country: "México",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      href: "/app/liga-mx/r/marco-antonio-ortiz",
      matches: 27,
      sampleGamesObserved: 27,
      avgYellow: 5.15,
      ebYellow: 4.89,
      avgRed: 0.3,
      ebRed: 0.28,
      avgPenalties: 0.37,
      ebPenalties: 0.35,
      avgFouls: 23.9,
      avgGoals: 2.61,
      leagueMeanYellow: 4.42,
      leagueMeanRed: 0.24,
      leagueMeanPenalties: 0.31,
      tier: "estricto",
      tierLabel: "Estricto",
      rigorPercentile: 78,
      rank: 2,
      totalInLeague: 5,
      lastMatch: {
        matchSlug: "pumas-vs-toluca-22b91a",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        dateIso: "2026-11-16T00:00:00Z",
        dateLabel: "15 nov",
        round: "Jornada 15",
        homeTeam: "Pumas UNAM",
        awayTeam: "Toluca",
        homeSlug: "pumas-unam",
        awaySlug: "toluca",
        score: { home: 1, away: 1 },
        status: "FT",
        href: "/app/liga-mx/g/pumas-vs-toluca-22b91a",
      },
      nextAssignment: null,
    },
    {
      slug: "fernando-hernandez",
      name: "Fernando Hernández",
      country: "México",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      href: "/app/liga-mx/r/fernando-hernandez",
      matches: 24,
      sampleGamesObserved: 24,
      avgYellow: 4.46,
      ebYellow: 4.44,
      avgRed: 0.25,
      ebRed: 0.25,
      avgPenalties: 0.29,
      ebPenalties: 0.3,
      avgFouls: 22.4,
      avgGoals: 2.83,
      leagueMeanYellow: 4.42,
      leagueMeanRed: 0.24,
      leagueMeanPenalties: 0.31,
      tier: "promedio",
      tierLabel: "Promedio",
      rigorPercentile: 54,
      rank: 3,
      totalInLeague: 5,
      lastMatch: null,
      nextAssignment: {
        matchSlug: "guadalajara-vs-pachuca-55d12b",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        kickoffUtc: "2026-11-23T01:05:00Z",
        dateLabel: "Dom 22 · 19:05",
        round: "Jornada 16",
        venue: "Estadio Akron",
        homeTeam: "Guadalajara",
        homeSlug: "guadalajara",
        awayTeam: "Pachuca",
        awaySlug: "pachuca",
        status: "NS",
        href: "/app/liga-mx/g/guadalajara-vs-pachuca-55d12b",
      },
    },
    {
      slug: "adonai-escobedo",
      name: "Adonai Escobedo",
      country: "México",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      href: "/app/liga-mx/r/adonai-escobedo",
      matches: 21,
      sampleGamesObserved: 21,
      avgYellow: 4.19,
      ebYellow: 4.29,
      avgRed: 0.19,
      ebRed: 0.21,
      avgPenalties: 0.29,
      ebPenalties: 0.3,
      avgFouls: 21.8,
      avgGoals: 2.91,
      leagueMeanYellow: 4.42,
      leagueMeanRed: 0.24,
      leagueMeanPenalties: 0.31,
      tier: "promedio",
      tierLabel: "Promedio",
      rigorPercentile: 43,
      rank: 4,
      totalInLeague: 5,
      lastMatch: null,
      nextAssignment: null,
    },
    {
      slug: "luis-enrique-santander",
      name: "Luis Enrique Santander",
      country: "México",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      href: "/app/liga-mx/r/luis-enrique-santander",
      matches: 29,
      sampleGamesObserved: 29,
      avgYellow: 3.34,
      ebYellow: 3.71,
      avgRed: 0.14,
      ebRed: 0.17,
      avgPenalties: 0.21,
      ebPenalties: 0.24,
      avgFouls: 19.6,
      avgGoals: 3.04,
      leagueMeanYellow: 4.42,
      leagueMeanRed: 0.24,
      leagueMeanPenalties: 0.31,
      tier: "permisivo",
      tierLabel: "Permisivo",
      rigorPercentile: 18,
      rank: 5,
      totalInLeague: 5,
      lastMatch: {
        matchSlug: "monterrey-vs-leon-72a90c",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        dateIso: "2026-11-14T03:00:00Z",
        dateLabel: "13 nov",
        round: "Jornada 15",
        homeTeam: "Monterrey",
        awayTeam: "Club León",
        homeSlug: "monterrey",
        awaySlug: "club-leon",
        score: { home: 3, away: 1 },
        status: "FT",
        href: "/app/liga-mx/g/monterrey-vs-leon-72a90c",
      },
      nextAssignment: null,
    },
  ],
};

const CESAR_RAMOS_PROFILE: RefereeProfileData = {
  slug: "cesar-ramos",
  name: "César Ramos",
  country: "México",
  primaryLeague: "liga-mx",
  primaryLeagueLabel: "Liga MX",
  href: "/app/liga-mx/r/cesar-ramos",
  kappa: 15,
  matches: 32,
  observedMatches: 32,
  avgYellow: 5.42,
  ebYellow: 5.18,
  avgRed: 0.34,
  ebRed: 0.31,
  avgPenalties: 0.41,
  ebPenalties: 0.38,
  avgFouls: 24.6,
  avgGoals: 2.75,
  leagueMeanYellow: 4.42,
  leagueMeanRed: 0.24,
  leagueMeanPenalties: 0.31,
  tier: "estricto",
  tierLabel: "Estricto",
  rigorPercentile: 89,
  rankInPrimaryLeague: 1,
  totalInPrimaryLeague: 18,
  nextAssignment: {
    matchSlug: "club-america-vs-tigres-uanl-91c40e",
    league: "liga-mx",
    leagueLabel: "Liga MX",
    kickoffUtc: "2026-11-23T03:00:00Z",
    dateLabel: "Dom 22 · 21:00",
    round: "Jornada 16",
    venue: "Estadio Azteca",
    homeTeam: "Club América",
    homeSlug: "club-america",
    awayTeam: "Tigres UANL",
    awaySlug: "tigres-uanl",
    status: "NS",
    href: "/app/liga-mx/g/club-america-vs-tigres-uanl-91c40e",
  },
  bookablePlayers: [
    {
      id: "bp-carioca",
      slug: "rafael-carioca",
      name: "Rafael Carioca",
      shortName: "R. Carioca",
      teamSlug: "tigres-uanl",
      teamName: "Tigres UANL",
      side: "away",
      positionGroup: "MID",
      positionLabel: "Mediocentro",
      appearances: 14,
      yellowCards: 6,
      redCards: 1,
      foulsCommitted: 29,
      yellowsPerMatch: 0.43,
      foulsPerMatch: 2.07,
      disciplineScore: 84,
      href: "/app/liga-mx/t/tigres-uanl/p/rafael-carioca",
    },
    {
      id: "bp-caceres",
      slug: "sebastian-caceres",
      name: "Sebastián Cáceres",
      shortName: "S. Cáceres",
      teamSlug: "club-america",
      teamName: "Club América",
      side: "home",
      positionGroup: "DEF",
      positionLabel: "Defensa central",
      appearances: 13,
      yellowCards: 5,
      redCards: 0,
      foulsCommitted: 22,
      yellowsPerMatch: 0.38,
      foulsPerMatch: 1.69,
      disciplineScore: 76,
      href: "/app/liga-mx/t/club-america/p/sebastian-caceres",
    },
    {
      id: "bp-gorriaran",
      slug: "fernando-gorriaran",
      name: "Fernando Gorriarán",
      shortName: "F. Gorriarán",
      teamSlug: "tigres-uanl",
      teamName: "Tigres UANL",
      side: "away",
      positionGroup: "MID",
      positionLabel: "Interior",
      appearances: 15,
      yellowCards: 5,
      redCards: 0,
      foulsCommitted: 27,
      yellowsPerMatch: 0.33,
      foulsPerMatch: 1.8,
      disciplineScore: 71,
      href: "/app/liga-mx/t/tigres-uanl/p/fernando-gorriaran",
    },
  ],
  recentMatches: [
    {
      matchSlug: "cruz-azul-vs-monterrey-84a21c",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      dateIso: "2026-11-15T01:00:00Z",
      dateLabel: "14 nov",
      round: "Jornada 15",
      homeTeam: "Cruz Azul",
      awayTeam: "Monterrey",
      homeSlug: "cruz-azul",
      awaySlug: "monterrey",
      score: { home: 2, away: 1 },
      status: "FT",
      href: "/app/liga-mx/g/cruz-azul-vs-monterrey-84a21c",
    },
    {
      matchSlug: "tigres-vs-pumas-63c81d",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      dateIso: "2026-11-08T03:00:00Z",
      dateLabel: "07 nov",
      round: "Jornada 14",
      homeTeam: "Tigres UANL",
      awayTeam: "Pumas UNAM",
      homeSlug: "tigres-uanl",
      awaySlug: "pumas-unam",
      score: { home: 2, away: 2 },
      status: "FT",
      href: "/app/liga-mx/g/tigres-vs-pumas-63c81d",
    },
    {
      matchSlug: "toluca-vs-america-44e20b",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      dateIso: "2026-10-31T23:00:00Z",
      dateLabel: "31 oct",
      round: "Jornada 13",
      homeTeam: "Toluca",
      awayTeam: "Club América",
      homeSlug: "toluca",
      awaySlug: "club-america",
      score: { home: 1, away: 2 },
      status: "FT",
      href: "/app/liga-mx/g/toluca-vs-america-44e20b",
    },
  ],
  competitionBreakdown: [
    {
      league: "liga-mx",
      leagueLabel: "Liga MX",
      matchesObserved: 24,
      sampleMatches: 24,
      avgYellow: 5.46,
      ebYellow: 5.21,
      avgRed: 0.33,
      ebRed: 0.3,
      avgPenalties: 0.42,
      ebPenalties: 0.39,
      avgFouls: 24.8,
      avgGoals: 2.79,
      tier: "estricto",
      tierLabel: "Estricto",
      rankInLeague: 1,
      totalInLeague: 18,
    },
    {
      league: "concacaf-nations",
      leagueLabel: "Concacaf Nations",
      matchesObserved: 8,
      sampleMatches: 8,
      avgYellow: 5.25,
      ebYellow: 4.92,
      avgRed: 0.38,
      ebRed: 0.31,
      avgPenalties: 0.38,
      ebPenalties: 0.34,
      avgFouls: 24.1,
      avgGoals: 2.63,
      tier: "estricto",
      tierLabel: "Estricto",
      rankInLeague: 2,
      totalInLeague: 12,
    },
  ],
};

function RefereesStoryShell({
  children,
  mobile = false,
  role = "member",
}: {
  readonly children: React.ReactNode;
  readonly mobile?: boolean;
  readonly role?: "member" | "visitor";
}): React.JSX.Element {
  return (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider
        dataset={role === "visitor" ? VISITOR_DATASET : STORY_DATASET}
        initialRole={role}
      >
        <div
          className="pl-stage"
          style={{
            minHeight: "100vh",
            padding: mobile ? 12 : 24,
          }}
        >
          <div
            style={{
              maxWidth: mobile ? 375 : 1140,
              width: "100%",
              margin: "0 auto",
            }}
          >
            {children}
          </div>
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

function SearchAutoFill({
  query,
  children,
}: {
  readonly query: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    const root = hostRef.current;
    if (!root) return undefined;
    const timerId = window.setTimeout(() => {
      const input = root.querySelector<HTMLInputElement>(".pl-sf-search-input");
      if (!input) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (valueSetter) {
        valueSetter.call(input, query);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, 30);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [query]);

  return <div ref={hostRef}>{children}</div>;
}

export const RankingArbitralEbOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <RefereesStoryShell>
      <RefereesClubView
        ranking={LIGA_MX_REFEREE_RANKING}
        availableLeagues={AVAILABLE_LEAGUES}
        onNavigate={() => undefined}
      />
    </RefereesStoryShell>
  ),
};

export const RankingArbitralEbClaro: Story = {
  globals: { theme: "light" },
  render: RankingArbitralEbOscuro.render,
};

export const FiltroBusquedaVaciaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <RefereesStoryShell>
      <SearchAutoFill query="ArbitroInexistente">
        <RefereesClubView
          ranking={LIGA_MX_REFEREE_RANKING}
          availableLeagues={AVAILABLE_LEAGUES}
          onNavigate={() => undefined}
        />
      </SearchAutoFill>
    </RefereesStoryShell>
  ),
};

export const FiltroBusquedaVaciaClaro: Story = {
  globals: { theme: "light" },
  render: FiltroBusquedaVaciaOscuro.render,
};

export const PerfilArbitralOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <RefereesStoryShell>
      <RefereesClubView
        profile={CESAR_RAMOS_PROFILE}
        onNavigate={() => undefined}
      />
    </RefereesStoryShell>
  ),
};

export const PerfilArbitralClaro: Story = {
  globals: { theme: "light" },
  render: PerfilArbitralOscuro.render,
};

export const VisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <RefereesStoryShell role="visitor">
      <RefereesClubView
        league="liga-mx"
        title="Árbitros · Liga MX"
        availableLeagues={[]}
        onNavigate={() => undefined}
      />
    </RefereesStoryShell>
  ),
};

export const VisitanteCeroFugaClaro: Story = {
  globals: { theme: "light" },
  render: VisitanteCeroFugaOscuro.render,
};

export const MovilRankingOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <RefereesStoryShell mobile>
      <RefereesClubView
        ranking={LIGA_MX_REFEREE_RANKING}
        availableLeagues={AVAILABLE_LEAGUES}
        onNavigate={() => undefined}
      />
    </RefereesStoryShell>
  ),
};

export const MovilRankingClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: MovilRankingOscuro.render,
};

export const MovilPerfilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <RefereesStoryShell mobile>
      <RefereesClubView
        profile={CESAR_RAMOS_PROFILE}
        onNavigate={() => undefined}
      />
    </RefereesStoryShell>
  ),
};

export const MovilPerfilClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: MovilPerfilOscuro.render,
};
