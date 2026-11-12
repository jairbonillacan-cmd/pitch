import React from "react";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "./access-guard";
import {
  JornadaClubView,
  LeagueHubClubView,
  MatchStudioClubView,
  MultiPicksClubView,
} from "./club/CoreMatchViews";
import {
  AccountReferralsClubView,
  BitacoraClubView,
  FounderAdminClubView,
  HistorialClubView,
} from "./club/LedgerAccountAdminViews";
import {
  MomiosExplorerClubView,
  ParlayBuilderClubView,
  PropsLabClubView,
} from "./club/ParlayAndQuantViews";
import {
  SocialVipClubView,
  TipstarPortalClubView,
} from "./club/SocialAndTipstarViews";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import {
  AuthSurfaceV4,
  OnboardingSurfaceV4,
} from "./public/AuthAndOnboardingSurfaces";
import { LandingSurface } from "./public/LandingSurface";
import {
  PricingSurface,
  PublicTipstarPickSurface,
  TechPrecisionSurface,
} from "./public/TechAndPricingSurfaces";
import type { ViewerRole } from "./types";

function makeStoryMatch(opts: {
  id: string;
  league: "liga-mx" | "premier-league" | "laliga" | "nfl";
  leagueLabel: string;
  sport: "football" | "american-football";
  status: "NS" | "FT";
  homeSlug: string;
  homeName: string;
  homeCode: string;
  awaySlug: string;
  awayName: string;
  awayCode: string;
  x12: [number, number, number];
  proj: { home: number; away: number; total: number };
  score?: { home: number; away: number };
}): MatchAnalysis {
  const isNfl = opts.sport === "american-football";
  return {
    id: opts.id,
    league: asLeagueId(opts.league),
    leagueLabel: opts.leagueLabel,
    sport: opts.sport,
    round: isNfl ? "Semana 10" : "Jornada 16",
    day: "2026-11-14",
    dayLabel: "sábado, 14 de noviembre",
    kickoffUtc: "2026-11-14T20:00:00Z",
    kickoffLocal: "19:00",
    venue: isNfl ? "Arrowhead Stadium" : "Estadio Azteca",
    status: opts.status,
    score: opts.score,
    home: {
      slug: opts.homeSlug,
      name: opts.homeName,
      shortName: opts.homeName,
      code: opts.homeCode,
      record: isNfl ? "7G-2P" : "10G-3E-2P",
    },
    away: {
      slug: opts.awaySlug,
      name: opts.awayName,
      shortName: opts.awayName,
      code: opts.awayCode,
      record: isNfl ? "6G-3P" : "8G-4E-3P",
    },
    projection: opts.proj,
    x12: opts.x12,
    outcomes: isNfl
      ? [
          {
            key: "home",
            label: `${opts.homeName} gana`,
            probability: opts.x12[0],
            fairOdds: { decimal: 1.54, american: -185 },
          },
          {
            key: "away",
            label: `${opts.awayName} gana`,
            probability: opts.x12[2],
            fairOdds: { decimal: 2.86, american: 186 },
          },
        ]
      : [
          {
            key: "home",
            label: `${opts.homeName} gana`,
            probability: opts.x12[0],
            fairOdds: { decimal: 1.72, american: -139 },
          },
          {
            key: "draw",
            label: "Empate",
            probability: opts.x12[1],
            fairOdds: { decimal: 4.17, american: 317 },
          },
          {
            key: "away",
            label: `${opts.awayName} gana`,
            probability: opts.x12[2],
            fairOdds: { decimal: 5.56, american: 456 },
          },
        ],
    marketGroups: [
      {
        group: isNfl ? "Ganador" : "Resultado",
        rows: [
          {
            market: asMarketKey("h2h"),
            selection: "home",
            label: `${opts.homeName} gana`,
            p: opts.x12[0],
            fairOdds: Math.round((1 / opts.x12[0]) * 100) / 100,
          },
        ],
      },
    ],
    factors: [
      { label: "Forma local", detail: "4G-1E", impact: "4G-1E", value: "4G-1E" },
      { label: "Forma visitante", detail: "3G-2P", impact: "3G-2P", value: "3G-2P" },
      { label: "Posición local", detail: "2.º lugar", impact: "2.º", value: "2.º" },
      { label: "Posición visitante", detail: "5.º lugar", impact: "5.º", value: "5.º" },
    ],
    trace: [],
    confidence: { score: 82, level: "alta", reasons: [] },
    restDays: { home: 6, away: 4 },
  };
}

const STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 16",
    generatedAt: "2026-11-10T18:00:00Z",
    games: [
      makeStoryMatch({
        id: "lmx-ame-tig",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        status: "NS",
        homeSlug: "club-america",
        homeName: "América",
        homeCode: "AME",
        awaySlug: "tigres-uanl",
        awayName: "Tigres",
        awayCode: "TIG",
        x12: [0.58, 0.24, 0.18],
        proj: { home: 1.92, away: 1.08, total: 3.0 },
      }),
      makeStoryMatch({
        id: "lmx-caz-mty",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        status: "FT",
        homeSlug: "cruz-azul",
        homeName: "Cruz Azul",
        homeCode: "CAZ",
        awaySlug: "monterrey",
        awayName: "Monterrey",
        awayCode: "MTY",
        x12: [0.61, 0.22, 0.17],
        proj: { home: 2.05, away: 1.02, total: 3.07 },
        score: { home: 2, away: 1 },
      }),
    ],
    standings: [
      {
        teamId: "liga-mx.cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        code: "CAZ",
        played: 15,
        won: 12,
        drawn: 2,
        lost: 1,
        goalsFor: 34,
        goalsAgainst: 11,
        points: 38,
      },
      {
        teamId: "liga-mx.club-america",
        name: "América",
        shortName: "América",
        code: "AME",
        played: 15,
        won: 10,
        drawn: 3,
        lost: 2,
        goalsFor: 29,
        goalsAgainst: 15,
        points: 33,
      },
    ],
  },
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "2026",
    roundLabel: "Semana 10",
    generatedAt: "2026-11-10T18:00:00Z",
    games: [
      makeStoryMatch({
        id: "nfl-kc-buf",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        status: "NS",
        homeSlug: "kansas-city-chiefs",
        homeName: "Chiefs",
        homeCode: "KC",
        awaySlug: "buffalo-bills",
        awayName: "Bills",
        awayCode: "BUF",
        x12: [0.64, 0, 0.36],
        proj: { home: 26.8, away: 22.1, total: 48.9 },
      }),
      makeStoryMatch({
        id: "nfl-det-gb",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        status: "FT",
        homeSlug: "detroit-lions",
        homeName: "Lions",
        homeCode: "DET",
        awaySlug: "green-bay-packers",
        awayName: "Packers",
        awayCode: "GB",
        x12: [0.62, 0, 0.38],
        proj: { home: 27.4, away: 21.6, total: 49.0 },
        score: { home: 28, away: 20 },
      }),
    ],
  },
  {
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    season: "2026/27",
    roundLabel: "Jornada 12",
    generatedAt: "2026-11-10T18:00:00Z",
    games: [
      makeStoryMatch({
        id: "epl-ars-liv",
        league: "premier-league",
        leagueLabel: "Premier League",
        sport: "football",
        status: "NS",
        homeSlug: "arsenal",
        homeName: "Arsenal",
        homeCode: "ARS",
        awaySlug: "liverpool",
        awayName: "Liverpool",
        awayCode: "LIV",
        x12: [0.52, 0.25, 0.23],
        proj: { home: 1.78, away: 1.32, total: 3.1 },
      }),
    ],
  },
]);

const VISITOR_REDACTED_DATASET = redactDatasetForVisitor(STORY_DATASET);

function StoryShell({
  role,
  redacted = false,
  children,
}: {
  role: ViewerRole;
  redacted?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <PlatformProvider
      dataset={redacted ? VISITOR_REDACTED_DATASET : STORY_DATASET}
      initialRole={role}
      allowRoleSimulation
    >
      {children}
    </PlatformProvider>
  );
}

export default {
  title: "PitchLab v4 / Liquid Glass & Spacetime Suite",
  parameters: {
    layout: "fullscreen",
  },
};

export const PublicLanding = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <LandingSurface />
    </StoryShell>
  ),
};

export const PublicTechPrecision = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <TechPrecisionSurface />
    </StoryShell>
  ),
};

export const PublicPaseTotalPricing = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <PricingSurface />
    </StoryShell>
  ),
};

export const PublicTipstarTicket = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <PublicTipstarPickSurface pickSlug="sofia-sem" />
    </StoryShell>
  ),
};

export const PublicSignupTrial = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <AuthSurfaceV4 mode="signup" initialPromoCode="SOFIA5" />
    </StoryShell>
  ),
};

export const PublicOnboarding18Plus = {
  render: () => (
    <StoryShell role="member">
      <OnboardingSurfaceV4 />
    </StoryShell>
  ),
};

export const ClubJornadaHome = {
  render: () => (
    <StoryShell role="member">
      <JornadaClubView />
    </StoryShell>
  ),
};

export const ClubMultiPicks = {
  render: () => (
    <StoryShell role="member">
      <MultiPicksClubView />
    </StoryShell>
  ),
};

export const ClubLeagueHub = {
  render: () => (
    <StoryShell role="member">
      <LeagueHubClubView leagueId={asLeagueId("liga-mx")} />
    </StoryShell>
  ),
};

export const ClubMatchStudio5Picks = {
  render: () => (
    <StoryShell role="member">
      <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="lmx-ame-tig" />
    </StoryShell>
  ),
};

export const ClubParlayBuilderSgp = {
  render: () => (
    <StoryShell role="member">
      <ParlayBuilderClubView />
    </StoryShell>
  ),
};

export const ClubPlayerPropsLab = {
  render: () => (
    <StoryShell role="member">
      <PropsLabClubView />
    </StoryShell>
  ),
};

export const ClubMomiosExplorer = {
  render: () => (
    <StoryShell role="member">
      <MomiosExplorerClubView />
    </StoryShell>
  ),
};

export const ClubSocialVip = {
  render: () => (
    <StoryShell role="member">
      <SocialVipClubView />
    </StoryShell>
  ),
};

export const ClubTipstarCreatorPortal = {
  render: () => (
    <StoryShell role="tipstar">
      <TipstarPortalClubView />
    </StoryShell>
  ),
};

export const ClubHistorialAudited = {
  render: () => (
    <StoryShell role="member">
      <HistorialClubView />
    </StoryShell>
  ),
};

export const ClubBitacoraPersonal = {
  render: () => (
    <StoryShell role="member">
      <BitacoraClubView />
    </StoryShell>
  ),
};

export const ClubAccountAndReferrals = {
  render: () => (
    <StoryShell role="member">
      <AccountReferralsClubView />
    </StoryShell>
  ),
};

export const ClubFounderAdmin = {
  render: () => (
    <StoryShell role="admin">
      <FounderAdminClubView />
    </StoryShell>
  ),
};
