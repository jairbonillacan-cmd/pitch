import React, { useMemo, useState } from "react";
import { asLeagueId, asMarketKey, type LiveScoreboardEntry, type MatchAnalysis } from "@pitchlab/contracts";
import { STORY_DATASET, makeStoryMatch } from "./story-fixtures";
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
  TipsterPortalClubView,
} from "./club/SocialAndTipsterViews";
import { HomeClubView, HomeFilterHeader } from "./club/home/HomeClubView";
import { HomeLeagueStrip, HomeSportStrip } from "./club/home/HomeSportStrip";
import {
  ALL,
  buildHomeSportLeagues,
  filterGames,
  gamesForSelection,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
} from "./club/home/home-model";
import { OfficialDailyParlayCard } from "./club/home/OfficialDailyParlayCard";
import { DailyParlaysResultsSection } from "./club/DailyParlaysResultsSection";
import { HomeMatchCard } from "./components/HomeMatchCard";
import { ClubLayoutShell } from "./components/ShellChrome";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider, usePlatformCore } from "./platform-provider";
import {
  AuthSurfaceV4,
  OnboardingSurfaceV4,
} from "./public/AuthAndOnboardingSurfaces";
import { LandingSurface } from "./public/LandingSurface";
import {
  PricingSurface,
  PublicTipsterPickSurface,
  TechPrecisionSurface,
} from "./public/TechAndPricingSurfaces";
import type { ViewerRole } from "./types";

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
  globals: { theme: "dark" },
  render: () => <LandingSurface dataset={VISITOR_REDACTED_DATASET} />,
};

export const PublicLandingLight = {
  ...PublicLanding,
  globals: { theme: "light" },
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

export const PublicTipsterTicket = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <PublicTipsterPickSurface pickSlug="sofia-sem" />
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

/** Jornada dentro del shell completo: encabezado con la campana de notificaciones. */
export const ClubJornadaConEncabezado = {
  render: () => (
    <StoryShell role="member">
      <ClubLayoutShell activePath="/app">
        <JornadaClubView />
      </ClubLayoutShell>
    </StoryShell>
  ),
};

/** Inicio: días → deporte → liga, tarjetas de partido y columna con parlay, valor y bitácora. */
export const ClubInicioOscuro = {
  render: () => (
    <StoryShell role="member">
      <ClubLayoutShell activePath="/app">
        <HomeClubView />
      </ClubLayoutShell>
    </StoryShell>
  ),
  globals: { theme: "dark" },
};

export const ClubInicioClaro = {
  render: () => (
    <StoryShell role="member">
      <ClubLayoutShell activePath="/app">
        <HomeClubView />
      </ClubLayoutShell>
    </StoryShell>
  ),
  globals: { theme: "light" },
};

/** Sin Pase: la tarjeta oculta el pick principal y el marcador proyectado. */
export const ClubInicioVisitante = {
  render: () => (
    <StoryShell role="visitor" redacted>
      <ClubLayoutShell activePath="/app">
        <HomeClubView />
      </ClubLayoutShell>
    </StoryShell>
  ),
  globals: { theme: "dark" },
};

export const ClubInicioVisitanteClaro = {
  ...ClubInicioVisitante,
  globals: { theme: "light" },
};

function FirstGameCard(): React.JSX.Element {
  const { dataset } = usePlatformCore();
  const game = dataset.games.find((g) => g.status !== "FT") ?? dataset.games[0];
  return (
    <div className="pl-stage" style={{ minHeight: "auto" }}>
      <div style={{ maxWidth: 380, padding: 24 }}>{game ? <HomeMatchCard game={game} /> : null}</div>
    </div>
  );
}

export const TarjetaPartidoOscuro = {
  render: () => (
    <StoryShell role="member">
      <FirstGameCard />
    </StoryShell>
  ),
  globals: { theme: "dark" },
};

export const TarjetaPartidoClaro = {
  render: () => (
    <StoryShell role="member">
      <FirstGameCard />
    </StoryShell>
  ),
  globals: { theme: "light" },
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

export const ClubSocialVipClaro = {
  ...ClubSocialVip,
  globals: { theme: "light" },
};

export const ClubTipsterCreatorPortal = {
  render: () => (
    <StoryShell role="tipster">
      <TipsterPortalClubView />
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

export const ClubFounderAdminModeracionOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <StoryShell role="admin">
      <FounderAdminClubView
        storyFunnel={{
          windowDays: 30,
          generatedAtIso: "2026-11-15T12:00:00.000Z",
          stages: [
            { stage: "landing", order: 1, label: "Visita a landing", count30d: 840, conversionFromPrevPct: null, conversionFromLandingPct: 100 },
            { stage: "signup_step1", order: 2, label: "Inicio paso 1 (cuenta)", count30d: 315, conversionFromPrevPct: 37.5, conversionFromLandingPct: 37.5 },
            { stage: "signup_step2", order: 3, label: "Completa paso 2 (perfil)", count30d: 240, conversionFromPrevPct: 76.2, conversionFromLandingPct: 28.6 },
            { stage: "first_sealed_pick", order: 4, label: "Primer pick sellado", count30d: 175, conversionFromPrevPct: 72.9, conversionFromLandingPct: 20.8 },
            { stage: "spei_transfer", order: 5, label: "Solicitud SPEI", count30d: 62, conversionFromPrevPct: 35.4, conversionFromLandingPct: 7.4 },
            { stage: "coupon_redeemed", order: 6, label: "Cupón canjeado", count30d: 54, conversionFromPrevPct: 87.1, conversionFromLandingPct: 6.4 },
          ],
        }}
        storyModeration={{
          pendingQueue: [
            {
              targetType: "post",
              targetId: "post-mod-1",
              postId: "post-mod-1",
              body: "Entren a mi grupo privado para picks garantizados sin perder jamás.",
              isHiddenByModeration: true,
              authorUserId: "u-spam-1",
              authorHandle: "raul_picks",
              authorName: "Raúl Vega",
              authorPaused: false,
              reportCount: 3,
              reasons: ["spam_enlaces", "apuesta_riesgosa"],
              latestReportAt: "2026-11-14T19:20:00Z",
            },
            {
              targetType: "comment",
              targetId: "comment-mod-2",
              postId: "post-mod-9",
              body: "Comentario fuera de tono en el hilo del partido.",
              isHiddenByModeration: false,
              authorUserId: "u-mod-2",
              authorHandle: "carlos_mx",
              authorName: "Carlos Soto",
              authorPaused: false,
              reportCount: 1,
              reasons: ["ofensivo"],
              latestReportAt: "2026-11-14T19:10:00Z",
            },
          ],
          hiddenItems: [
            {
              targetType: "post",
              targetId: "post-mod-1",
              postId: "post-mod-1",
              body: "Entren a mi grupo privado para picks garantizados sin perder jamás.",
              authorUserId: "u-spam-1",
              authorHandle: "raul_picks",
              authorName: "Raúl Vega",
              authorPaused: false,
              createdAt: "2026-11-14T18:55:00Z",
            },
          ],
          pausedMembers: [
            {
              userId: "u-paused-1",
              handle: "diego_spam",
              displayName: "Diego Morales",
              email: "diego@example.com",
            },
          ],
        }}
      />
    </StoryShell>
  ),
};

export const ClubFounderAdminModeracionClaro = {
  ...ClubFounderAdminModeracionOscuro,
  globals: { theme: "light" },
};

const PARLAY_DAY_STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 16",
    generatedAt: "2026-11-14T10:00:00Z",
    games: [
      makeStoryMatch({
        id: "p4-lmx-1",
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
        x12: [0.76, 0.14, 0.1],
        proj: { home: 2.3, away: 0.7, total: 3.0 },
      }),
      makeStoryMatch({
        id: "p4-lmx-2",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        status: "NS",
        homeSlug: "cruz-azul",
        homeName: "Cruz Azul",
        homeCode: "CAZ",
        awaySlug: "pumas-unam",
        awayName: "Pumas",
        awayCode: "PUM",
        x12: [0.74, 0.16, 0.1],
        proj: { home: 2.1, away: 0.8, total: 2.9 },
      }),
      makeStoryMatch({
        id: "p4-lmx-3",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        status: "NS",
        homeSlug: "monterrey",
        homeName: "Monterrey",
        homeCode: "MTY",
        awaySlug: "chivas",
        awayName: "Chivas",
        awayCode: "GDL",
        x12: [0.72, 0.17, 0.11],
        proj: { home: 2.0, away: 0.9, total: 2.9 },
      }),
      makeStoryMatch({
        id: "p4-lmx-ft-1",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        status: "FT",
        homeSlug: "club-america",
        homeName: "América",
        homeCode: "AME",
        awaySlug: "atlas",
        awayName: "Atlas",
        awayCode: "ATL",
        x12: [0.75, 0.15, 0.1],
        proj: { home: 2.2, away: 0.7, total: 2.9 },
        score: { home: 2, away: 0 },
      }),
      makeStoryMatch({
        id: "p4-lmx-ft-2",
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
        x12: [0.73, 0.16, 0.11],
        proj: { home: 2.0, away: 0.8, total: 2.8 },
        score: { home: 3, away: 1 },
      }),
    ],
  },
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "Temporada 2026",
    roundLabel: "Semana 11",
    generatedAt: "2026-11-14T10:00:00Z",
    games: [
      makeStoryMatch({
        id: "p4-nfl-1",
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
        proj: { home: 27.5, away: 23.0, total: 50.5 },
      }),
      makeStoryMatch({
        id: "p4-nfl-ft-1",
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
      makeStoryMatch({
        id: "p4-nfl-ft-2",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        status: "FT",
        homeSlug: "baltimore-ravens",
        homeName: "Ravens",
        homeCode: "BAL",
        awaySlug: "cincinnati-bengals",
        awayName: "Bengals",
        awayCode: "CIN",
        x12: [0.61, 0, 0.39],
        proj: { home: 28.0, away: 23.0, total: 51.0 },
        score: { home: 24, away: 27 },
      }),
    ],
  },
]);

export const ParlayDelDiaOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={PARLAY_DAY_STORY_DATASET} initialRole="member">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <OfficialDailyParlayCard
          games={PARLAY_DAY_STORY_DATASET.games}
          selectedDay="2026-11-14"
          today="2026-11-14"
        />
      </div>
    </PlatformProvider>
  ),
};

export const ParlayDelDiaClaro = {
  ...ParlayDelDiaOscuro,
  globals: { theme: "light" },
};

export const ParlayDelDiaVacioOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={PARLAY_DAY_STORY_DATASET} initialRole="member">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <OfficialDailyParlayCard
          games={PARLAY_DAY_STORY_DATASET.games.slice(0, 1)}
          selectedDay="2026-11-14"
          today="2026-11-14"
        />
      </div>
    </PlatformProvider>
  ),
};

export const ParlayDelDiaVacioClaro = {
  ...ParlayDelDiaVacioOscuro,
  globals: { theme: "light" },
};

export const GeneradorPersonalParlayOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={PARLAY_DAY_STORY_DATASET} initialRole="member">
      <ParlayBuilderClubView />
    </PlatformProvider>
  ),
};

export const GeneradorPersonalParlayClaro = {
  ...GeneradorPersonalParlayOscuro,
  globals: { theme: "light" },
};

export const HistorialParlaysDelDiaOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={PARLAY_DAY_STORY_DATASET} initialRole="member">
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <DailyParlaysResultsSection
          games={PARLAY_DAY_STORY_DATASET.games.map((g) => ({
            ...g,
            dayId: g.status === "FT" ? "2026-11-08" : g.dayId,
          }))}
          oddsFormat="american"
        />
      </div>
    </PlatformProvider>
  ),
};

export const HistorialParlaysDelDiaClaro = {
  ...HistorialParlaysDelDiaOscuro,
  globals: { theme: "light" },
};

const NFL_OBJETIVO_STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "Temporada 2026",
    roundLabel: "Semana 10",
    generatedAt: "2026-11-14T10:00:00Z",
    games: [
      {
        ...makeStoryMatch({
          id: "obj-nfl-kc",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          status: "NS",
          homeSlug: "atlanta-falcons",
          homeName: "Atlanta",
          homeCode: "ATL",
          awaySlug: "kansas-city-chiefs",
          awayName: "Kansas City",
          awayCode: "KC",
          x12: [0.348, 0, 0.652],
          proj: { home: 20.0, away: 24.3, total: 44.3 },
        }),
        marketGroups: [
          {
            group: "Ganador",
            rows: [
              { market: asMarketKey("h2h"), selection: "away", label: "Kansas City gana", p: 0.652, fairOdds: 1.53 },
              { market: asMarketKey("h2h"), selection: "home", label: "Atlanta gana", p: 0.348, fairOdds: 2.87 },
            ],
          },
        ],
      },
      {
        ...makeStoryMatch({
          id: "obj-nfl-hou",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          status: "NS",
          homeSlug: "cleveland-browns",
          homeName: "Cleveland",
          homeCode: "CLE",
          awaySlug: "houston-texans",
          awayName: "Houston",
          awayCode: "HOU",
          x12: [0.385, 0, 0.615],
          proj: { home: 19.5, away: 23.0, total: 42.5 },
        }),
        marketGroups: [
          {
            group: "Ganador",
            rows: [
              { market: asMarketKey("h2h"), selection: "away", label: "Houston gana", p: 0.615, fairOdds: 1.63 },
              { market: asMarketKey("h2h"), selection: "home", label: "Cleveland gana", p: 0.385, fairOdds: 2.6 },
            ],
          },
        ],
      },
      {
        ...makeStoryMatch({
          id: "obj-nfl-sf",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          status: "NS",
          homeSlug: "dallas-cowboys",
          homeName: "Dallas",
          homeCode: "DAL",
          awaySlug: "san-francisco-49ers",
          awayName: "San Francisco",
          awayCode: "SF",
          x12: [0.339, 0, 0.661],
          proj: { home: 20.5, away: 25.0, total: 45.5 },
        }),
        marketGroups: [
          {
            group: "Ganador",
            rows: [
              { market: asMarketKey("h2h"), selection: "away", label: "San Francisco gana", p: 0.661, fairOdds: 1.51 },
              { market: asMarketKey("h2h"), selection: "home", label: "Dallas gana", p: 0.339, fairOdds: 2.95 },
            ],
          },
        ],
      },
      {
        ...makeStoryMatch({
          id: "obj-nfl-jax",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          status: "NS",
          homeSlug: "tennessee-titans",
          homeName: "Tennessee",
          homeCode: "TEN",
          awaySlug: "jacksonville-jaguars",
          awayName: "Jacksonville",
          awayCode: "JAX",
          x12: [0.171, 0, 0.829],
          proj: { home: 16.0, away: 26.5, total: 42.5 },
        }),
        marketGroups: [
          {
            group: "Ganador",
            rows: [
              { market: asMarketKey("h2h"), selection: "away", label: "Jacksonville gana", p: 0.829, fairOdds: 1.21 },
              { market: asMarketKey("h2h"), selection: "home", label: "Tennessee gana", p: 0.171, fairOdds: 5.85 },
            ],
          },
          {
            group: "Hándicap alternativo -7.5",
            rows: [
              { market: asMarketKey("spreads"), selection: "away_-7.5", label: "JAX -7.5", line: -7.5, p: 0.608, fairOdds: 1.64 },
              { market: asMarketKey("spreads"), selection: "home_7.5", label: "TEN +7.5", line: 7.5, p: 0.392, fairOdds: 2.55 },
            ],
          },
        ],
      },
    ],
  },
]);

export const ParlayObjetivoNflOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={NFL_OBJETIVO_STORY_DATASET} initialRole="member">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <OfficialDailyParlayCard
          games={NFL_OBJETIVO_STORY_DATASET.games}
          selectedDay="2026-11-14"
          today="2026-11-14"
          initialMode="objetivo"
          activeLeague={asLeagueId("nfl")}
        />
      </div>
    </PlatformProvider>
  ),
};

export const ParlayObjetivoNflClaro = {
  ...ParlayObjetivoNflOscuro,
  globals: { theme: "light" },
};

function makeHeaderStoryGame(opts: {
  id: string;
  league: "liga-mx" | "premier-league" | "nfl" | "nba";
  leagueLabel: string;
  sport: "football" | "american-football" | "basketball";
  day: string;
  dayLabel: string;
  kickoffUtc: string;
  kickoffLocal: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  status?: "NS" | "FT";
}): MatchAnalysis {
  const base = makeStoryMatch({
    id: opts.id,
    league: opts.league === "nba" ? "nfl" : opts.league,
    leagueLabel: opts.leagueLabel,
    sport: opts.sport === "basketball" ? "american-football" : opts.sport,
    status: opts.status ?? "NS",
    homeSlug: opts.homeCode.toLowerCase(),
    homeName: opts.homeName,
    homeCode: opts.homeCode,
    awaySlug: opts.awayCode.toLowerCase(),
    awayName: opts.awayName,
    awayCode: opts.awayCode,
    x12: [0.62, opts.sport === "football" ? 0.22 : 0, opts.sport === "football" ? 0.16 : 0.38],
    proj: { home: 26, away: 20, total: 46 },
  });
  return {
    ...base,
    league: asLeagueId(opts.league),
    leagueLabel: opts.leagueLabel,
    sport: opts.sport,
    day: opts.day,
    dayLabel: opts.dayLabel,
    kickoffUtc: opts.kickoffUtc,
    kickoffLocal: opts.kickoffLocal,
  };
}

const HEADER_STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "2026",
    roundLabel: "Semana 10",
    generatedAt: "2026-11-15T16:00:00Z",
    games: [
      makeHeaderStoryGame({
        id: "hdr-nfl-kc-buf",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        day: "2026-11-15",
        dayLabel: "domingo, 15 de noviembre",
        kickoffUtc: "2026-11-15T20:00:00Z",
        kickoffLocal: "14:00",
        homeCode: "KC",
        homeName: "Kansas City",
        awayCode: "BUF",
        awayName: "Buffalo",
      }),
      makeHeaderStoryGame({
        id: "hdr-nfl-sf-dal",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        day: "2026-11-15",
        dayLabel: "domingo, 15 de noviembre",
        kickoffUtc: "2026-11-15T21:25:00Z",
        kickoffLocal: "15:25",
        homeCode: "SF",
        homeName: "San Francisco",
        awayCode: "DAL",
        awayName: "Dallas",
      }),
    ],
  },
  {
    league: asLeagueId("nba"),
    leagueLabel: "NBA",
    sport: "basketball",
    season: "2026-27",
    roundLabel: "Temporada regular",
    generatedAt: "2026-11-15T16:00:00Z",
    games: [
      makeHeaderStoryGame({
        id: "hdr-nba-bos-mia",
        league: "nba",
        leagueLabel: "NBA",
        sport: "basketball",
        day: "2026-11-15",
        dayLabel: "domingo, 15 de noviembre",
        kickoffUtc: "2026-11-16T00:00:00Z",
        kickoffLocal: "18:00",
        homeCode: "BOS",
        homeName: "Celtics",
        awayCode: "MIA",
        awayName: "Heat",
      }),
      makeHeaderStoryGame({
        id: "hdr-nba-lal-den",
        league: "nba",
        leagueLabel: "NBA",
        sport: "basketball",
        day: "2026-11-15",
        dayLabel: "domingo, 15 de noviembre",
        kickoffUtc: "2026-11-16T02:30:00Z",
        kickoffLocal: "20:30",
        homeCode: "LAL",
        homeName: "Lakers",
        awayCode: "DEN",
        awayName: "Nuggets",
      }),
    ],
  },
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 17",
    generatedAt: "2026-11-15T16:00:00Z",
    games: [
      makeHeaderStoryGame({
        id: "hdr-lmx-ame-tig",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        day: "2026-11-15",
        dayLabel: "domingo, 15 de noviembre",
        kickoffUtc: "2026-11-16T01:00:00Z",
        kickoffLocal: "19:00",
        homeCode: "AME",
        homeName: "América",
        awayCode: "TIG",
        awayName: "Tigres",
      }),
      makeHeaderStoryGame({
        id: "hdr-lmx-caz-pum",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        day: "2026-11-20",
        dayLabel: "viernes, 20 de noviembre",
        kickoffUtc: "2026-11-21T01:00:00Z",
        kickoffLocal: "19:00",
        homeCode: "CAZ",
        homeName: "Cruz Azul",
        awayCode: "PUM",
        awayName: "Pumas",
      }),
    ],
  },
]);

const HEADER_LIVE_MAP: ReadonlyMap<string, LiveScoreboardEntry> = new Map([
  [
    "hdr-nfl-kc-buf",
    {
      gameId: "hdr-nfl-kc-buf",
      league: "nfl",
      phase: "live",
      clock: "Q3",
      minute: null,
      score: { home: 28, away: 3 },
      htScore: { home: 21, away: 3 },
      redCards: null,
      kickoffUtc: "2026-11-15T20:00:00Z",
    },
  ],
]);

function EncabezadoInicioStory({
  initialDay = "2026-11-15",
  initialSport = ALL,
}: {
  initialDay?: string;
  initialSport?: SportFilter;
}): React.JSX.Element {
  const today = "2026-11-15";
  const [day, setDay] = useState<string>(initialDay);
  const [sport, setSport] = useState<SportFilter>(initialSport);
  const [league, setLeague] = useState<LeagueFilter>(ALL);
  const games = HEADER_STORY_DATASET.games;
  const dayGames = useMemo(() => gamesForSelection(games, day, today), [games, day, today]);
  const visible = useMemo(() => filterGames(dayGames, sport, league), [dayGames, sport, league]);
  return (
    <PlatformProvider dataset={HEADER_STORY_DATASET} initialRole="member">
      <div className="pl-stage" style={{ minHeight: "auto" }}>
        <div className="p-3 sm:p-6 max-w-6xl mx-auto">
          <HomeFilterHeader
            allGames={games}
            dayGames={dayGames}
            visibleGames={visible}
            today={today}
            day={day}
            sport={sport}
            league={league}
            liveByGameId={HEADER_LIVE_MAP}
            onDayChange={(next: DaySelection) => {
              setDay(String(next));
              setLeague(ALL);
            }}
            onSportChange={(next) => {
              setSport(next);
              setLeague(ALL);
            }}
            onLeagueChange={setLeague}
            onJumpDay={(target, reset) => {
              setDay(target);
              if (reset) setSport(ALL);
              setLeague(ALL);
            }}
          />
        </div>
      </div>
    </PlatformProvider>
  );
}

export const EncabezadoInicioOscuro = {
  globals: { theme: "dark" },
  render: () => <EncabezadoInicioStory />,
};

export const EncabezadoInicioClaro = {
  ...EncabezadoInicioOscuro,
  globals: { theme: "light" },
};

export const EncabezadoInicioDiaVacioOscuro = {
  globals: { theme: "dark" },
  render: () => <EncabezadoInicioStory initialDay="2026-11-18" />,
};

export const EncabezadoInicioDiaVacioClaro = {
  ...EncabezadoInicioDiaVacioOscuro,
  globals: { theme: "light" },
};

function CabeceraClubStory(): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <ClubLayoutShell activePath="/app">
        <div className="panel-card p-6 space-y-2">
          <h1 className="m-0 text-lg font-bold">Navegación en cabecera</h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Pasa el cursor o haz clic en la barra de navegación del encabezado para desplegar el panel sobre el contenido.
          </p>
        </div>
      </ClubLayoutShell>
    </PlatformProvider>
  );
}

export const CabeceraClubOscuro = {
  globals: { theme: "dark" },
  render: () => <CabeceraClubStory />,
};

export const CabeceraClubClaro = {
  ...CabeceraClubOscuro,
  globals: { theme: "light" },
};

function CabeceraClubLigaStory(): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <ClubLayoutShell activePath="/app/liga-mx">
        <div className="panel-card p-6 space-y-2">
          <h1 className="m-0 text-lg font-bold">Liga MX activa en cabecera</h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Vista de ruta secundaria donde la tira rápida móvil permanece disponible y la liga activa queda resaltada.
          </p>
        </div>
      </ClubLayoutShell>
    </PlatformProvider>
  );
}

export const CabeceraClubLigaActivaOscuro = {
  globals: { theme: "dark" },
  render: () => <CabeceraClubLigaStory />,
};

export const CabeceraClubLigaActivaClaro = {
  ...CabeceraClubLigaActivaOscuro,
  globals: { theme: "light" },
};

function TiraDeportesYLigasStory(): React.JSX.Element {
  const [sport, setSport] = useState<SportFilter>("futbol");
  const [league, setLeague] = useState<LeagueFilter>(ALL);
  const dayGames = STORY_DATASET.games;
  const sportLeagues = useMemo(
    () => buildHomeSportLeagues(STORY_DATASET.leagues, STORY_DATASET.games, dayGames, sport),
    [dayGames, sport],
  );
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <div className="pl-stage p-6 space-y-6">
        <div className="panel-card p-4 space-y-3">
          <p className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
            Variante de cabecera (ancho completo)
          </p>
          <HomeSportStrip
            dayGames={dayGames}
            sport={sport}
            onSelectSport={(next) => {
              setSport(next);
              setLeague(ALL);
            }}
            variant="header"
          />
          {sportLeagues.length > 0 ? (
            <HomeLeagueStrip
              leagues={sportLeagues}
              sportDayGamesCount={dayGames.length}
              league={league}
              onSelectLeague={setLeague}
            />
          ) : null}
        </div>
        <div className="panel-card p-4 space-y-3" style={{ maxWidth: 420 }}>
          <p className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
            Contenedor angosto (420 px · flechas de desplazamiento activas)
          </p>
          <HomeSportStrip
            dayGames={dayGames}
            sport={sport}
            onSelectSport={(next) => {
              setSport(next);
              setLeague(ALL);
            }}
            variant="header"
          />
        </div>
      </div>
    </PlatformProvider>
  );
}

export const TiraDeportesYLigasOscuro = {
  globals: { theme: "dark" },
  render: () => <TiraDeportesYLigasStory />,
};

export const TiraDeportesYLigasClaro = {
  ...TiraDeportesYLigasOscuro,
  globals: { theme: "light" },
};
