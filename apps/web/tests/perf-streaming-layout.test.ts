import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { PlatformProvider, usePlatformCore } from "@pitchlab/ui/platform-provider";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";

const mocks = vi.hoisted(() => ({
  headersMap: new Map<string, string>(),
  getViewerAccess: vi.fn(),
  loadMonth1Flag: vi.fn(),
  loadClubPlatformState: vi.fn(),
  loadInitialShellDatasetForAccess: vi.fn(),
  loadServerPicksCatalogsForScreener: vi.fn(),
  loadGameSummary: vi.fn(),
  loadLeagueSnapshotEnvelope: vi.fn(),
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  permanentRedirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${to}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => mocks.headersMap.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  permanentRedirect: mocks.permanentRedirect,
  notFound: mocks.notFound,
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/platform-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/platform-data")>();
  return {
    ...actual,
    loadMonth1Flag: mocks.loadMonth1Flag,
    loadClubPlatformState: mocks.loadClubPlatformState,
    loadInitialShellDatasetForAccess: mocks.loadInitialShellDatasetForAccess,
    loadServerPicksCatalogsForScreener: mocks.loadServerPicksCatalogsForScreener,
    loadGameSummary: mocks.loadGameSummary,
  };
});

vi.mock("../src/server/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/snapshots")>();
  return {
    ...actual,
    loadLeagueSnapshotEnvelope: mocks.loadLeagueSnapshotEnvelope,
  };
});

vi.mock("../src/client/platform-client-bridge", () => ({
  PlatformClientBridge: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-mock-bridge": "1" }, props.children as React.ReactNode),
}));

vi.mock("../src/client/club-shell-bridge", () => ({
  ClubShellBridge: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-mock-shell": "1" }, props.children as React.ReactNode),
}));

vi.mock("../app/shell-ergonomics.css", () => ({}));
vi.mock("../app/record-v2.css", () => ({}));
vi.mock("../app/live.css", () => ({}));
vi.mock("../app/atomic-kit.css", () => ({}));
vi.mock("../app/alerts-referees.css", () => ({}));
vi.mock("../app/match-deep-panels.css", () => ({}));
vi.mock("../app/picks-screener.css", () => ({}));

import ClubAppLayout from "../app/app/layout";
import ClubHomePage from "../app/app/page";
import ClubPicksPage from "../app/app/picks/page";
import {
  buildEmptyClubShellDataset,
  loadClubShellViewerState,
  shouldDeferLayoutDataset,
  yieldForStreamFlush,
} from "../src/server/club-shell-viewer";
import { PRODUCT_LEAGUES } from "../src/server/snapshots-config";
import type { ViewerAccess } from "../src/server/viewer-access";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TESTS_DIR, "..");

const ACCESS_BETA: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_ACCOUNT_MEMBER: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: {
    handle: "sofia_member",
    displayName: "Sofía Member",
    initials: "SM",
    avatarUrl: null,
    referralCode: "SOFIA1",
    suggestedHandle: null,
  },
};

const ACCESS_EXPIRED_VISITOR: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: {
    handle: "expired_user",
    displayName: "Expired User",
    initials: "EU",
    avatarUrl: null,
    referralCode: null,
    suggestedHandle: null,
  },
};

function makeSampleGame(id: string, league: "premier-league" | "liga-mx" = "premier-league"): PlatformGame {
  const leagueId = asLeagueId(league);
  return {
    id,
    league: leagueId,
    leagueLabel: league === "premier-league" ? "Premier League" : "Liga MX",
    sport: "football",
    round: "Jornada 1",
    dayId: "2026-11-24",
    dayLabel: "Hoy",
    kickoffUtc: "2026-11-24T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadio Test",
    status: "NS",
    home: { slug: "home-fc", name: "Home FC", shortName: "HOM", code: "HOM", record: "1-0-0" },
    away: { slug: "away-fc", name: "Away FC", shortName: "AWY", code: "AWY", record: "0-1-0" },
    x12: [0.45, 0.28, 0.27],
    projection: { home: 1.5, away: 1.1, total: 2.6 },
    confidenceScore: 72,
    confidenceLevel: "media",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "",
      lineupsConfirmed60m: false,
      confirmedLineups: null,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "hace 5 min",
    spacetime: null,
  };
}

function DatasetProbe(): React.JSX.Element {
  const { dataset } = usePlatformCore();
  return React.createElement("div", {
    "data-games-count": String(dataset.games.length),
    "data-leagues-count": String(dataset.leagues.length),
    "data-daily-promo": dataset.dailyPromoPickId,
    "data-game-ids": dataset.games.map((g) => g.id).join(","),
    "data-pl-total": String(
      dataset.leagues.find((l) => l.league === asLeagueId("premier-league"))?.totalGames ?? -1,
    ),
  });
}

describe("Streaming RSC inmediato en /app/**, club-shell-viewer y diferimiento de /api/shell/extend", () => {
  afterEach(() => {
    mocks.headersMap.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("shouldDeferLayoutDataset distingue rutas con streaming/payload propio vs rutas secundarias SSR", () => {
    expect(shouldDeferLayoutDataset("/app")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/")).toBe(true);
    expect(shouldDeferLayoutDataset("/app?match=g1")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/picks")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/picks?tab=settled")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/premier-league")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/premier-league/g/arsenal-vs-chelsea")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/liga-mx/t/monterrey")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/liga-mx/t/monterrey/p/player-1")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/liga-mx/arbitros")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/historial")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/account?tab=referrals")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/admin")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/canjear")).toBe(true);
    expect(shouldDeferLayoutDataset("/app/tech")).toBe(true);

    expect(shouldDeferLayoutDataset("/app/parlays")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/social")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/lab")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/alertas")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/momios")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/comparar")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/props")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/tipster")).toBe(false);
    expect(shouldDeferLayoutDataset("/app/u/sofia_nfl")).toBe(false);
  });

  it("loadClubShellViewerState resuelve identidad y emptyShellDataset en < 20 ms sin construir Stage-1 ni filtrar datos a visitantes", async () => {
    const startMs = performance.now();
    const memberState = await loadClubShellViewerState("member", {
      access: ACCESS_ACCOUNT_MEMBER,
      serverMonth1NoCardMode: false,
    });
    const elapsedMs = performance.now() - startMs;

    expect(elapsedMs).toBeLessThan(20);
    expect(memberState.hasActiveSession).toBe(true);
    expect(memberState.initialRole).toBe("member");
    expect(memberState.viewerVia).toBe("account");
    expect(memberState.viewerIdentity?.handle).toBe("sofia_member");
    expect(memberState.dataset.games).toEqual([]);
    expect(memberState.dataset.leagues.length).toBe(PRODUCT_LEAGUES.length);
    expect(memberState.dataset.isServerRedactedForVisitor).toBe(false);
    const bundesligaSummary = memberState.dataset.leagues.find(
      (l) => l.league === asLeagueId("bundesliga"),
    );
    expect(bundesligaSummary?.logoUrl).toMatch(/^https:\/\/sports\.bzzoiro\.com\/img\/league\//);

    const visitorState = await loadClubShellViewerState("member", {
      access: ACCESS_EXPIRED_VISITOR,
      serverMonth1NoCardMode: true,
    });
    expect(visitorState.hasActiveSession).toBe(false);
    expect(visitorState.initialRole).toBe("visitor");
    expect(visitorState.allowRoleSimulation).toBe(false);
    expect(visitorState.dataset.games).toEqual([]);
    expect(visitorState.dataset.isServerRedactedForVisitor).toBe(true);
  });

  it("ClubAppLayout evita loadClubPlatformState en rutas streaming y evita doble lectura de loadLeagueSnapshotEnvelope", async () => {
    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    mocks.loadMonth1Flag.mockResolvedValue(false);
    mocks.loadClubPlatformState.mockResolvedValue(
      await loadClubShellViewerState("member", {
        access: ACCESS_BETA,
        serverMonth1NoCardMode: false,
      }),
    );
    mocks.loadLeagueSnapshotEnvelope.mockReturnValue({
      state: "ready",
      data: {
        schemaVersion: 1,
        league: asLeagueId("premier-league"),
        leagueLabel: "Premier League",
        sport: "football",
        season: "2026-27",
        roundLabel: "Jornada 1",
        generatedAt: "2026-11-24T12:00:00Z",
        days: [],
        games: [
          {
            id: "pl-g-test",
            league: asLeagueId("premier-league"),
            leagueLabel: "Premier League",
            sport: "football",
            dayId: "2026-11-24",
            dayLabel: "Hoy",
            kickoffUtc: "2026-11-24T20:00:00Z",
            kickoffLocal: "14:00",
            home: { id: "premier-league.arsenal", slug: "arsenal", name: "Arsenal", shortName: "ARS", code: "ARS" },
            away: { id: "premier-league.chelsea", slug: "chelsea", name: "Chelsea", shortName: "CHE", code: "CHE" },
            status: "scheduled",
            x12: [0.5, 0.25, 0.25],
            projection: { home: 1.5, away: 1.0, total: 2.5 },
            confidence: "alta",
            markets: [],
            factors: [],
            picks: [],
            headToHead: [],
          },
        ],
        standings: [],
      },
    });

    for (const streamingPath of [
      "/app",
      "/app/picks",
      "/app/premier-league",
      "/app/premier-league/g/pl-g-test",
    ]) {
      mocks.loadClubPlatformState.mockClear();
      mocks.headersMap.set("x-pitchlab-club-path", streamingPath);
      const element = await ClubAppLayout({
        children: React.createElement("div", { "data-child": streamingPath }),
      });
      expect(mocks.loadClubPlatformState).not.toHaveBeenCalled();
      const bridgeProps = element.props as {
        dataset: PlatformDataset;
        deferredShellExtend?: boolean;
      };
      expect(bridgeProps.deferredShellExtend).toBe(true);
      expect(bridgeProps.dataset.games).toEqual([]);
      expect(bridgeProps.dataset.leagues.length).toBe(PRODUCT_LEAGUES.length);
      expect(bridgeProps.dataset.isServerRedactedForVisitor).toBe(false);
    }

    mocks.loadLeagueSnapshotEnvelope.mockClear();
    mocks.headersMap.set("x-pitchlab-club-path", "/app/premier-league/games/pl-g-test");
    await expect(
      ClubAppLayout({
        children: React.createElement("div"),
      }),
    ).rejects.toThrow(/^NEXT_PERMANENT_REDIRECT:\/app\/premier-league\/g\//);
    expect(mocks.loadLeagueSnapshotEnvelope).toHaveBeenCalledTimes(1);

    mocks.loadClubPlatformState.mockClear();
    mocks.headersMap.set("x-pitchlab-club-path", "/app/parlays");
    await ClubAppLayout({
      children: React.createElement("div"),
    });
    expect(mocks.loadClubPlatformState).toHaveBeenCalledTimes(1);
  });

  it("ClubHomePage y ClubPicksPage exponen Suspense con esqueletos geométricos y propagan Stage-1 vía PlatformGamesSupplement", async () => {
    const homeEl = ClubHomePage();
    expect(homeEl.type).toBe(React.Suspense);

    const picksEl = ClubPicksPage();
    expect(picksEl.type).toBe(React.Suspense);

    const sampleGames = [makeSampleGame("pl-1", "premier-league")];
    const emptyDataset = buildEmptyClubShellDataset(true, "2026-11-24T12:00:00Z");

    const html = renderToStaticMarkup(
      React.createElement(PlatformProvider, {
        dataset: emptyDataset,
        initialRole: "member",
        children: React.createElement(PlatformGamesSupplement, {
          games: sampleGames,
          dailyPromoPickId: "pick-promo-1",
          leagues: [
            {
              league: asLeagueId("premier-league"),
              label: "Premier League",
              sport: "football",
              season: "2026-27",
              roundLabel: "Jornada 1",
              generatedAt: "2026-11-24T12:00:00Z",
              totalGames: 10,
              upcomingCount: 6,
              finishedCount: 4,
              standings: [],
            },
          ],
          children: React.createElement(DatasetProbe),
        }),
      }),
    );

    expect(html).toContain('data-games-count="1"');
    expect(html).toContain(`data-leagues-count="${PRODUCT_LEAGUES.length}"`);
    expect(html).toContain('data-daily-promo="pick-promo-1"');
    expect(html).toContain('data-game-ids="pl-1"');
    expect(html).toContain('data-pl-total="10"');

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const sampleStage1: PlatformDataset = {
      ...emptyDataset,
      games: sampleGames,
      dailyPromoPickId: "pick-promo-1",
    };
    mocks.loadInitialShellDatasetForAccess.mockReturnValue(sampleStage1);
    mocks.loadServerPicksCatalogsForScreener.mockResolvedValue({});

    const homeInnerEl = (homeEl.props as { children: React.ReactElement }).children;
    const HomeStreamComponent = homeInnerEl.type as () => Promise<React.ReactElement>;
    const homeStreamResult = await HomeStreamComponent();
    expect(mocks.loadInitialShellDatasetForAccess).toHaveBeenCalledWith(true);
    expect((homeStreamResult.props as { games: PlatformGame[] }).games).toEqual(sampleGames);

    const picksInnerEl = (picksEl.props as { children: React.ReactElement }).children;
    const PicksStreamComponent = picksInnerEl.type as () => Promise<React.ReactElement>;
    const picksStreamResult = await PicksStreamComponent();
    expect(mocks.loadServerPicksCatalogsForScreener).toHaveBeenCalledWith({ fullAccess: true });
    expect((picksStreamResult.props as { games: PlatformGame[] }).games).toEqual(sampleGames);

    const events: string[] = [];
    const flushPromise = yieldForStreamFlush().then(() => {
      events.push("flush");
    });
    Promise.resolve().then(() => {
      events.push("microtask");
    });
    await flushPromise;
    expect(events).toEqual(["microtask", "flush"]);
  });

  it("PlatformClientBridge programa /api/shell/extend tras el primer pintado con priority low y preserva alcance entre rutas", () => {
    const bridgeSrc = fs.readFileSync(
      path.join(WEB_ROOT, "src/client/platform-client-bridge.tsx"),
      "utf8",
    );
    expect(bridgeSrc).toContain("requestAnimationFrame");
    expect(bridgeSrc).toContain("requestIdleCallback");
    expect(bridgeSrc).toContain("80");
    expect(bridgeSrc).toContain('priority: background ? "low" : "auto"');
    expect(bridgeSrc).toContain("extendedPayloadRef");
    expect(bridgeSrc).toContain("startBackgroundTransition");
    expect(bridgeSrc).toContain("requiresImmediateShellExtend");
  });
});
