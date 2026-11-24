import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asGameId,
  asLeagueId,
  asMarketKey,
  asSeasonId,
  asTeamId,
  LeagueSnapshotSchema,
} from "@pitchlab/contracts";
import type { GamePreviewPayload } from "@pitchlab/ui/picks-catalog";
import { GET as gamePreviewGET } from "../app/api/games/[gameId]/preview/route";
import { GET as shellExtendGET } from "../app/api/shell/extend/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  BoundedStampCache,
  buildEntityLookupIndex,
  buildServerTimingHeader,
  safeStatMtimeMs,
  sanitizeServerTimingStage,
} from "../src/server/perf-cache";
import * as platformDataModule from "../src/server/platform-data";
import {
  loadResultadosPageData,
  loadResultadosViewProps,
} from "../src/server/public-site-data";
import { resetRateLimitsForTests } from "../src/server/request-security";
import * as snapshotsModule from "../src/server/snapshots";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
  loadMonth1Flag: vi.fn(),
  resolveServerFrozenMainPick: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/frozen-picks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/frozen-picks")>();
  return {
    ...actual,
    resolveServerFrozenMainPick: mocks.resolveServerFrozenMainPick,
  };
});

const ACCESS_VISITOR: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_BETA: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const FORBIDDEN_CDN_RE = /espncdn|mlbstatic/i;
const FORBIDDEN_INTERNAL_RE = /bzzoiro|scoutpicks/i;

function makeTempSnapshot(league: string, gameId: string, homeName: string, awayName: string) {
  const kickoff = "2026-12-01T20:00:00Z";
  const inputsAsOf = "2026-12-01T18:00:00Z";
  const leagueId = asLeagueId(league);
  const seasonId = asSeasonId("2026-27");
  return LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    provenance: "provider",
    source: "test-fixture",
    isDemo: false,
    league: leagueId,
    season: seasonId,
    seasonLabel: "2026-27",
    periodLabel: "Jornada 10",
    updatedAt: inputsAsOf,
    teamRates: {},
    games: [
      {
        id: asGameId(gameId),
        league: leagueId,
        season: seasonId,
        startTime: kickoff,
        status: "scheduled",
        neutralSite: false,
        home: {
          id: asTeamId(`${league}.home-fc`),
          league: leagueId,
          name: homeName,
          shortName: homeName.slice(0, 3).toUpperCase(),
          code: homeName.slice(0, 3).toUpperCase(),
        },
        away: {
          id: asTeamId(`${league}.away-fc`),
          league: leagueId,
          name: awayName,
          shortName: awayName.slice(0, 3).toUpperCase(),
          code: awayName.slice(0, 3).toUpperCase(),
        },
      },
    ],
    analyses: {
      [gameId]: {
        game: asGameId(gameId),
        cortex: {
          headline: `${homeName} llega con ventaja local`,
          headlineOrigin: "plantilla",
          sections: [
            {
              key: "lectura",
              title: "Lectura inicial",
              text: `${homeName} domina posesión y volumen en casa.`,
              origin: "plantilla",
            },
          ],
          fingerprint: "fp12345678",
          generatedAt: inputsAsOf,
          version: "1.0",
        },
        model: {
          id: "spacetime-v6",
          version: "6.0.0",
          status: "candidate",
          label: "Spacetime v6.0",
        },
        inputsAsOf,
        publishedAt: inputsAsOf,
        source: "test-fixture",
        x12: [0.48, 0.27, 0.25],
        projection: { home: 1.55, away: 1.05, total: 2.6, margin: 0.5 },
        probabilities: [
          { market: asMarketKey("1x2"), selection: "home", p: 0.48, fairOdds: 2.08 },
          { market: asMarketKey("totals"), selection: "over", line: 2.5, p: 0.54, fairOdds: 1.85 },
        ],
        marketGroups: [
          {
            group: "Resultado 1X2",
            rows: [
              {
                market: asMarketKey("1x2"),
                selection: "home",
                label: "Local",
                p: 0.48,
                fairOdds: 2.08,
              },
            ],
          },
        ],
        mostLikelyScore: { home: 1, away: 1, p: 0.12 },
        factors: [{ key: "form", label: "Forma reciente", value: "3-1-1" }],
        steps: [
          "Estado causal",
          "Localía",
          "Calibración",
          "Distribución",
          "Verificación",
          "Publicación",
        ],
      },
    },
    standings: [],
  });
}

describe("Optimización SSR, caché por mtimeMs, paralelización DB y payloads seguros (Issue #4)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimitsForTests();
    resetScrapingVelocityForTests();
    snapshotsModule.clearSnapshotCausalityCachesForTests();
    platformDataModule.clearPlatformDataCachesForTests();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("perf-cache implementa LRU con sello, índice O(1), safeStatMtimeMs y Server-Timing sanitizado", () => {
    const cache = new BoundedStampCache<number>(2);
    cache.set("a", "1", 10);
    cache.set("b", "1", 20);
    expect(cache.get("a", "1")).toBe(10);
    expect(cache.get("a", "2")).toBeUndefined();
    cache.set("c", "1", 30);
    expect(cache.get("b", "1")).toBeUndefined();
    expect(cache.get("a", "1")).toBe(10);
    expect(cache.get("c", "1")).toBe(30);

    const idx = buildEntityLookupIndex(
      [
        { id: "g1", slug: "arsenal-chelsea" },
        { id: "g2", slug: "america-chivas" },
      ],
      (item) => [item.slug],
    );
    expect(idx.getById("g1")?.slug).toBe("arsenal-chelsea");
    expect(idx.getByKey("AMERICA-CHIVAS")?.id).toBe("g2");

    expect(safeStatMtimeMs("")).toBe(0);
    expect(safeStatMtimeMs(path.join(os.tmpdir(), "__missing_pitchlab_file__.json"))).toBe(0);
    expect(safeStatMtimeMs(__filename)).toBeGreaterThan(0);

    expect(sanitizeServerTimingStage("db_lookup")).toBe("db_lookup");
    expect(sanitizeServerTimingStage("../secret/path")).toBeNull();
    expect(sanitizeServerTimingStage("stage with space")).toBeNull();
    const header = buildServerTimingHeader([
      { stage: "Preview", durationMs: 12.34 },
      { stage: "bad stage/path", durationMs: 99 },
      { stage: "db_read", durationMs: 4.56 },
    ]);
    expect(header).toBe("preview;dur=12.3, db_read;dur=4.6");
    expect(header).not.toMatch(FORBIDDEN_CDN_RE);
    expect(header).not.toMatch(FORBIDDEN_INTERNAL_RE);
  });

  it("snapshots indexa shell-index en memoria, mantiene cache hit sin falsas invalidaciones entre ligas e invalida al cambiar mtimeMs", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pl-ssr-snaps-"));
    tempDirs.push(tmpRoot);
    const snapRoot = path.join(tmpRoot, "data", "snapshots");
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
    snapshotsModule.clearSnapshotCausalityCachesForTests();

    const plDir = path.join(snapRoot, "premier-league");
    const llDir = path.join(snapRoot, "laliga");
    fs.mkdirSync(plDir, { recursive: true });
    fs.mkdirSync(llDir, { recursive: true });

    const plPath = path.join(plDir, "latest.json");
    const llPath = path.join(llDir, "latest.json");
    fs.writeFileSync(
      plPath,
      JSON.stringify(makeTempSnapshot("premier-league", "pl-g1", "Arsenal", "Chelsea")),
    );
    fs.writeFileSync(
      llPath,
      JSON.stringify(makeTempSnapshot("laliga", "ll-g1", "Real Madrid", "Sevilla")),
    );

    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(plPath, pastTime, pastTime);
    fs.utimesSync(llPath, pastTime, pastTime);

    snapshotsModule.clearSnapshotCausalityCachesForTests();
    const plEnv = snapshotsModule.loadLeagueSnapshotEnvelope("premier-league");
    expect(plEnv).toMatchObject({ state: "ready" });
    const llEnv = snapshotsModule.loadLeagueSnapshotEnvelope("laliga");
    expect(llEnv).toMatchObject({ state: "ready" });
    const shellIndexPath = path.join(snapRoot, "shell-index.json");
    fs.writeFileSync(
      shellIndexPath,
      JSON.stringify({
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        leagues: {
          "premier-league": plEnv,
          laliga: llEnv,
        },
      }),
    );

    snapshotsModule.clearSnapshotCausalityCachesForTests();
    const entry = snapshotsModule.readShellIndexEntryFast();
    expect(entry?.gameToLeague.get("pl-g1")).toBe("premier-league");
    expect(entry?.gameToLeague.get("ll-g1")).toBe("laliga");
    expect(snapshotsModule.findLeagueForGameIdInSnapshots("pl-g1")).toBe("premier-league");
    expect(snapshotsModule.findLeagueForGameIdInSnapshots("ll-g1")).toBe("laliga");

    const firstAll = snapshotsModule.loadAllActiveLeagueSnapshots();
    expect(firstAll["premier-league"].state).toBe("ready");
    expect(firstAll.laliga.state).toBe("ready");

    const readSpy = vi.spyOn(fs, "readFileSync");
    const secondAll = snapshotsModule.loadAllActiveLeagueSnapshots();
    expect(secondAll).toBe(firstAll);
    expect(readSpy).not.toHaveBeenCalled();

    const updatedPl = makeTempSnapshot("premier-league", "pl-g2", "Liverpool", "Everton");
    fs.writeFileSync(plPath, JSON.stringify(updatedPl));
    const futureTime = new Date(Date.now() + 5_000);
    fs.utimesSync(plPath, futureTime, futureTime);

    const afterMutation = snapshotsModule.loadAllActiveLeagueSnapshots();
    expect(afterMutation["premier-league"].data?.games[0]?.id).toBe("pl-g2");
    expect(afterMutation.laliga.data?.games[0]?.id).toBe("ll-g1");

    const plWriteup = snapshotsModule.loadCortexWriteup("premier-league", "pl-g2");
    expect(plWriteup?.headline).toContain("Liverpool");
  });

  it("mantiene Stage-1 <= 480 KB, preserva Cero-Fuga en rutas selectivas y valida /api/shell/extend y /api/games/[gameId]/preview", async () => {
    snapshotsModule.clearSnapshotCausalityCachesForTests();
    platformDataModule.clearPlatformDataCachesForTests();

    const memberStage1 = platformDataModule.loadInitialShellDatasetForAccess(true);
    const visitorStage1 = platformDataModule.loadInitialShellDatasetForAccess(false);
    expect(memberStage1.games.length).toBeLessThanOrEqual(52);
    expect(memberStage1.playerProps).toEqual([]);
    expect(visitorStage1.playerProps).toEqual([]);
    expect(visitorStage1.isServerRedactedForVisitor).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(memberStage1), "utf8")).toBeLessThanOrEqual(480 * 1024);
    expect(Buffer.byteLength(JSON.stringify(visitorStage1), "utf8")).toBeLessThanOrEqual(480 * 1024);

    const previewTarget = memberStage1.games.find(
      (g) =>
        g.status !== "FT" &&
        !g.picks.some((p) => Boolean(p.isDailyOpenPromo || p.isTipsterWeeklyOpen)),
    );
    expect(previewTarget).toBeDefined();

    const serieAGamesVisitor = await (async () => {
      mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
      return platformDataModule.loadLeagueHubGames("serie-a");
    })();
    for (const g of serieAGamesVisitor) {
      if (g.status !== "FT") {
        expect(g.picks.every((p) => !p.isDailyOpenPromo && !p.isTipsterWeeklyOpen)).toBe(true);
      }
    }

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    mocks.resolveServerFrozenMainPick.mockResolvedValue(null);

    const extendReq = new Request("http://localhost:3000/api/shell/extend");
    const extendRes = await shellExtendGET(extendReq);
    expect(extendRes.status).toBe(200);
    expect(extendRes.headers.get("Cache-Control")).toContain("no-store");
    expect(extendRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const extendTiming = extendRes.headers.get("Server-Timing") ?? "";
    expect(extendTiming).toMatch(/shell_extend;dur=\d+\.\d+/);
    const extendText = await extendRes.text();
    expect(extendText).not.toMatch(FORBIDDEN_CDN_RE);
    const extendJson = JSON.parse(extendText) as { isRedactedForVisitor: boolean; games: unknown[] };
    expect(extendJson.isRedactedForVisitor).toBe(false);
    expect(extendJson.games.length).toBeGreaterThan(0);

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const extendVisitorRes = await shellExtendGET(new Request("http://localhost:3000/api/shell/extend"));
    expect(extendVisitorRes.status).toBe(200);
    const extendVisitorJson = (await extendVisitorRes.json()) as { isRedactedForVisitor: boolean };
    expect(extendVisitorJson.isRedactedForVisitor).toBe(true);

    if (previewTarget) {
      mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
      const memberPreviewRes = await gamePreviewGET(
        new Request(`http://localhost:3000/api/games/${previewTarget.id}/preview`),
        { params: Promise.resolve({ gameId: previewTarget.id }) },
      );
      expect(memberPreviewRes.status).toBe(200);
      const previewTiming = memberPreviewRes.headers.get("Server-Timing") ?? "";
      expect(previewTiming).toMatch(/preview;dur=\d+\.\d+/);
      expect(previewTiming).not.toContain(previewTarget.id);
      const memberPreviewJson = (await memberPreviewRes.json()) as GamePreviewPayload;
      expect(memberPreviewJson.ok).toBe(true);
      expect(memberPreviewJson.fullAccess).toBe(true);

      mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
      const visitorPreviewRes = await gamePreviewGET(
        new Request(`http://localhost:3000/api/games/${previewTarget.id}/preview`),
        { params: Promise.resolve({ gameId: previewTarget.id }) },
      );
      expect(visitorPreviewRes.status).toBe(200);
      const visitorPreviewText = await visitorPreviewRes.text();
      expect(visitorPreviewText).not.toMatch(FORBIDDEN_CDN_RE);
      expect(visitorPreviewText).not.toMatch(FORBIDDEN_INTERNAL_RE);
      const visitorPreviewJson = JSON.parse(visitorPreviewText) as GamePreviewPayload;
      expect(visitorPreviewJson.fullAccess).toBe(false);
      expect(visitorPreviewJson.game.x12).toEqual([0, 0, 0]);
      expect(visitorPreviewJson.game.projection).toBeNull();
    }
  });

  it("loadClubPlatformState acepta contexto pre-resuelto y loadResultadosPageData pagina coherentemente", async () => {
    mocks.getViewerAccess.mockClear();
    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const state = await platformDataModule.loadClubPlatformState("member", {
      access: ACCESS_BETA,
      serverMonth1NoCardMode: false,
    });
    expect(state.hasActiveSession).toBe(true);
    expect(state.dataset.games.length).toBeLessThanOrEqual(52);
    expect(mocks.getViewerAccess).not.toHaveBeenCalled();

    const fullResultados = await loadResultadosViewProps();
    const pagedResultados = await loadResultadosPageData({ limit: 20, offset: 0 });
    expect(pagedResultados.totalCount).toBe(fullResultados.results.length);
    expect(pagedResultados.results).toEqual(fullResultados.results.slice(0, 20));
    expect(pagedResultados.hasMore).toBe(fullResultados.results.length > 20);
  });
});
