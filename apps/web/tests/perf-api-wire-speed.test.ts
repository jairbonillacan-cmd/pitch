import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LeagueSnapshotSchema,
  asGameId,
  asLeagueId,
  asMarketKey,
  asSeasonId,
  asTeamId,
} from "@pitchlab/contracts";
import type { GamePreviewPayload, MatchPicksCatalog } from "@pitchlab/ui/picks-catalog";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { GET as extendGET } from "../app/api/shell/extend/route";
import { GET as previewGET } from "../app/api/games/[gameId]/preview/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  clearPlatformDataCachesForTests,
  loadExtendedShellSerializedJson,
  loadGameDetail,
  loadGameSummary,
  loadInitialShellDatasetForAccess,
  loadServerPicksCatalogsForScreener,
  withoutGameDetail,
} from "../src/server/platform-data";
import {
  clearPropsExplorerCachesForTests,
  loadPlayerPropStreakCards,
} from "../src/server/props-explorer";
import { resetRateLimitsForTests } from "../src/server/request-security";
import {
  clearSnapshotCausalityCachesForTests,
  getCachedLeagueCausalityAuditV6,
  loadAllActiveLeagueSnapshots,
  loadLeagueSnapshotEnvelope,
  readShellIndexEntryFast,
} from "../src/server/snapshots";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
  resolveServerFrozenMainPick: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/frozen-picks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/frozen-picks")>()),
  resolveServerFrozenMainPick: mocks.resolveServerFrozenMainPick,
}));

const ACCESS_VISITOR: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_MEMBER: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const tempDirs: string[] = [];

interface ExtendWireBody {
  games: PlatformGame[];
  teams: NonNullable<PlatformDataset["teams"]>;
  isRedactedForVisitor: boolean;
}

describe("API wire compression, shell pruning, snapshot cut, props fast-scan and screener", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimitsForTests();
    resetScrapingVelocityForTests();
    clearSnapshotCausalityCachesForTests();
    clearPlatformDataCachesForTests();
    clearPropsExplorerCachesForTests();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("/api/shell/extend sirve JSON UTF-8 plano sin bytes gzip corruptos incluso con Accept-Encoding: gzip, mantiene compresibilidad < 200 KB y Cero-Fuga", async () => {
    mocks.getViewerAccess.mockResolvedValue(ACCESS_MEMBER);
    const acceptGzipReq = new Request("http://localhost:9990/api/shell/extend", {
      headers: { "accept-encoding": "gzip, deflate, br" },
    });
    const memberRes = await extendGET(acceptGzipReq);
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Content-Encoding")).toBeNull();
    expect(memberRes.headers.get("Content-Type")).toContain("application/json");
    expect(memberRes.headers.get("Cache-Control")).toContain("no-store");
    expect(memberRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(memberRes.headers.get("Server-Timing")).toMatch(/shell_extend;dur=\d+\.\d+/);

    const memberBytes = Buffer.from(await memberRes.arrayBuffer());
    expect(memberBytes[0] === 0x1f && memberBytes[1] === 0x8b).toBe(false);
    const memberText = memberBytes.toString("utf8");
    const expectedMemberJson = loadExtendedShellSerializedJson(true);
    expect(memberText).toBe(expectedMemberJson);
    expect(memberBytes.byteLength).toBeLessThan(1_950_000);
    expect(gzipSync(memberBytes, { level: 6 }).byteLength).toBeLessThan(200 * 1024);

    const plainRes = await extendGET(new Request("http://localhost:9990/api/shell/extend"));
    expect(plainRes.status).toBe(200);
    expect(plainRes.headers.get("Content-Encoding")).toBeNull();
    expect(await plainRes.text()).toBe(expectedMemberJson);

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorRes = await extendGET(
      new Request("http://localhost:9990/api/shell/extend", {
        headers: { "accept-encoding": "gzip, deflate, br" },
      }),
    );
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Content-Encoding")).toBeNull();
    const visitorBytes = Buffer.from(await visitorRes.arrayBuffer());
    expect(visitorBytes[0] === 0x1f && visitorBytes[1] === 0x8b).toBe(false);
    expect(gzipSync(visitorBytes, { level: 6 }).byteLength).toBeLessThan(120 * 1024);

    const visitorDecoded = JSON.parse(visitorBytes.toString("utf8")) as ExtendWireBody;
    expect(visitorDecoded.isRedactedForVisitor).toBe(true);
    const lockedVisitorGame = visitorDecoded.games.find(
      (g) =>
        g.status !== "FT" &&
        !g.picks.some((p) => Boolean(p.isDailyOpenPromo || p.isTipsterWeeklyOpen)),
    );
    expect(lockedVisitorGame).toBeDefined();
    expect(lockedVisitorGame!.parlayCandidates).toBeUndefined();
    for (const pk of lockedVisitorGame!.picks) {
      expect(pk.marketDecimal).toBeNull();
      expect(pk.edgePts).toBeNull();
    }

    const stage1 = loadInitialShellDatasetForAccess(true);
    const memberDecoded = JSON.parse(memberText) as ExtendWireBody;
    const memberIds = new Set(memberDecoded.games.map((g) => g.id));
    expect(memberDecoded.games.length).toBeGreaterThanOrEqual(stage1.games.length);
    for (const sg of stage1.games) {
      expect(memberIds.has(sg.id)).toBe(true);
    }
    expect(memberDecoded.teams.length).toBeGreaterThan(0);
    const hasParlayEligible = memberDecoded.games.some(
      (g) =>
        g.status === "NS" &&
        [...g.picks, ...(g.parlayCandidates ?? [])].some((pk) => {
          const dec = pk.marketDecimal ?? pk.fairDecimal;
          return !pk.isRedacted && pk.p >= 0.52 && dec >= 1.35;
        }),
    );
    expect(hasParlayEligible).toBe(true);
    const hasFourPickNsGame = memberDecoded.games.some(
      (g) => g.status !== "FT" && g.picks.length >= 4,
    );
    expect(hasFourPickNsGame).toBe(true);

    const templateGame = memberDecoded.games.find(
      (g) => g.status === "NS" && g.picks.length >= 2,
    );
    expect(templateGame).toBeDefined();
    const fixedNowMs = Date.parse("2026-11-22T06:00:00.000Z");
    const freshCapturedUtc = "2026-11-22T05:30:00.000Z";
    const syntheticDataset: PlatformDataset = {
      ...stage1,
      isServerRedactedForVisitor: false,
      games: [
        {
          ...templateGame!,
          picks: templateGame!.picks.slice(0, 3).map((pk, idx) => ({
            ...pk,
            slotIndex: idx,
            isRedacted: false,
            marketBookLabel: "Bet365",
            marketCapturedAtUtc: freshCapturedUtc,
            marketDecimal: 1.95,
            marketAmerican: -105,
            bookQuotes: [
              {
                book: "bet365",
                bookLabel: "Bet365",
                decimal: 1.95,
                capturedAtUtc: freshCapturedUtc,
                isBest: true,
              },
              {
                book: "pinnacle",
                bookLabel: "Pinnacle",
                decimal: 1.91,
                capturedAtUtc: freshCapturedUtc,
              },
            ],
          })),
        },
      ],
    };
    const slimWithMultiQuotes = withoutGameDetail(syntheticDataset, fixedNowMs);
    expect(slimWithMultiQuotes.games[0]?.picks.length).toBeGreaterThanOrEqual(2);
    for (const pk of slimWithMultiQuotes.games[0]!.picks) {
      expect(pk.bookQuotes?.length).toBe(2);
    }
  });

  it("/api/games/[gameId]/preview sirve JSON UTF-8 plano sin bytes gzip corruptos, evita duplicar injuries y preserva Cero-Fuga + Match Studio", async () => {
    mocks.resolveServerFrozenMainPick.mockResolvedValue(null);
    const stage1 = loadInitialShellDatasetForAccess(true);
    const targetUpcoming =
      stage1.games.find((g) => g.league === "premier-league" && g.status !== "FT") ??
      stage1.games.find((g) => g.status !== "FT");
    expect(targetUpcoming).toBeDefined();
    const targetId = targetUpcoming!.id;

    mocks.getViewerAccess.mockResolvedValue(ACCESS_MEMBER);
    const memberRes = await previewGET(
      new Request(`http://localhost:9990/api/games/${targetId}/preview`, {
        headers: { "accept-encoding": "gzip, deflate, br" },
      }),
      { params: Promise.resolve({ gameId: targetId }) },
    );
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Content-Encoding")).toBeNull();
    expect(memberRes.headers.get("Content-Type")).toContain("application/json");
    expect(memberRes.headers.get("Cache-Control")).toContain("no-store");
    expect(memberRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(memberRes.headers.get("Server-Timing")).toMatch(/preview;dur=\d+\.\d+/);

    const memberBytes = Buffer.from(await memberRes.arrayBuffer());
    expect(memberBytes[0] === 0x1f && memberBytes[1] === 0x8b).toBe(false);
    expect(gzipSync(memberBytes, { level: 6 }).byteLength).toBeLessThan(35 * 1024);
    const decodedMember = JSON.parse(memberBytes.toString("utf8")) as GamePreviewPayload;
    expect(decodedMember.ok).toBe(true);
    expect(decodedMember.fullAccess).toBe(true);
    expect(Array.isArray(decodedMember.injuries)).toBe(true);
    expect(decodedMember.detail?.injuries).toBeUndefined();
    expect(decodedMember.detail?.picksCatalog?.picks.length ?? 0).toBeLessThanOrEqual(32);

    const plainRes = await previewGET(
      new Request(`http://localhost:9990/api/games/${targetId}/preview`),
      { params: Promise.resolve({ gameId: targetId }) },
    );
    expect(plainRes.status).toBe(200);
    expect(plainRes.headers.get("Content-Encoding")).toBeNull();
    const plainJson = JSON.parse(await plainRes.text()) as GamePreviewPayload;
    expect(plainJson.gameId).toBe(decodedMember.gameId);

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorRes = await previewGET(
      new Request(`http://localhost:9990/api/games/${targetId}/preview`, {
        headers: { "accept-encoding": "gzip" },
      }),
      { params: Promise.resolve({ gameId: targetId }) },
    );
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Content-Encoding")).toBeNull();
    const visitorBytes = Buffer.from(await visitorRes.arrayBuffer());
    expect(visitorBytes[0] === 0x1f && visitorBytes[1] === 0x8b).toBe(false);
    const visitorDecoded = JSON.parse(visitorBytes.toString("utf8")) as GamePreviewPayload;
    expect(visitorDecoded.fullAccess).toBe(false);
    expect(visitorDecoded.detail?.picksCatalog?.isRedactedForVisitor).toBe(true);

    mocks.getViewerAccess.mockResolvedValue(ACCESS_MEMBER);
    const summary = await loadGameSummary(targetId);
    expect(summary).not.toBeNull();
    expect(summary!.parlayCandidates).toBeUndefined();
    expect(summary!.markets).toEqual([]);
    expect(summary!.headToHead).toEqual([]);
    expect(summary!.factors).toEqual([]);
    expect(summary!.spacetime).not.toBeNull();
    expect(summary!.picks.length).toBeGreaterThan(0);
    expect(summary!.picks.some((pk) => pk.rationale.length > 0)).toBe(true);

    const fullStage = loadAllActiveLeagueSnapshots();
    const finishedPlGame =
      fullStage["premier-league"]?.data?.games.find((g) => g.status === "FT" && g.hasForecast !== false) ??
      fullStage.laliga?.data?.games.find((g) => g.status === "FT" && g.hasForecast !== false);
    if (finishedPlGame) {
      const ftDetail = await loadGameDetail(finishedPlGame.id);
      expect(ftDetail?.picksCatalog?.picks.length ?? 0).toBeGreaterThan(0);
      expect(ftDetail?.enfrentamientos).toBeDefined();
      expect(ftDetail?.enrichedLineups).toBeDefined();
    }
  });

  it("loadAllActiveLeagueSnapshots mantiene paridad causal con el corte en disco e invalida por mtimeMs", () => {
    clearSnapshotCausalityCachesForTests();
    const firstAll = loadAllActiveLeagueSnapshots();
    const mlbEnvDirect = loadLeagueSnapshotEnvelope("mlb");
    const superLigDirect = loadLeagueSnapshotEnvelope("super-lig");

    expect(firstAll.mlb.state).toBe(mlbEnvDirect.state);
    expect(firstAll.mlb.data?.games.length).toBe(mlbEnvDirect.data?.games.length);
    expect(firstAll["super-lig"].state).toBe(superLigDirect.state);
    expect(firstAll["super-lig"].data?.games.length).toBe(superLigDirect.data?.games.length);

    clearSnapshotCausalityCachesForTests();
    const secondCold = loadAllActiveLeagueSnapshots();
    expect(secondCold.mlb.data?.games.map((g) => g.hasForecast)).toEqual(
      mlbEnvDirect.data?.games.map((g) => g.hasForecast),
    );
    expect(getCachedLeagueCausalityAuditV6("mlb")?.contaminatedAcceptedIntoLedgerCount).toBe(0);

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pl-wire-snaps-"));
    tempDirs.push(tmpRoot);
    const snapRoot = path.join(tmpRoot, "data", "snapshots");
    const plDir = path.join(snapRoot, "premier-league");
    fs.mkdirSync(plDir, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
    clearSnapshotCausalityCachesForTests();

    const makeSnap = (gameId: string, homeName: string) =>
      LeagueSnapshotSchema.parse({
        schemaVersion: 1,
        provenance: "provider",
        source: "test-fixture",
        isDemo: false,
        league: asLeagueId("premier-league"),
        season: asSeasonId("2026-27"),
        seasonLabel: "2026-27",
        periodLabel: "Jornada 1",
        updatedAt: "2026-11-22T04:00:00.000Z",
        teamRates: {},
        games: [
          {
            id: asGameId(gameId),
            league: asLeagueId("premier-league"),
            season: asSeasonId("2026-27"),
            status: "scheduled",
            startTime: "2026-11-28T15:00:00.000Z",
            neutralSite: false,
            home: {
              id: asTeamId("premier-league.arsenal"),
              league: asLeagueId("premier-league"),
              name: homeName,
              shortName: "ARS",
              code: "ARS",
            },
            away: {
              id: asTeamId("premier-league.chelsea"),
              league: asLeagueId("premier-league"),
              name: "Chelsea",
              shortName: "CHE",
              code: "CHE",
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
                  text: `${homeName} domina en casa.`,
                  origin: "plantilla",
                },
              ],
              fingerprint: "fp12345678",
              generatedAt: "2026-11-22T03:00:00.000Z",
              version: "1.0",
            },
            model: {
              id: "spacetime-v6",
              version: "6.0.0",
              status: "candidate",
              label: "Spacetime v6.0",
            },
            inputsAsOf: "2026-11-22T03:00:00.000Z",
            publishedAt: "2026-11-22T03:00:00.000Z",
            source: "test-fixture",
            x12: [0.5, 0.25, 0.25],
            projection: { home: 1.6, away: 1.1, total: 2.7, margin: 0.5 },
            probabilities: [
              { market: asMarketKey("1x2"), selection: "home", p: 0.5, fairOdds: 2.0 },
              { market: asMarketKey("totals"), selection: "over", line: 2.5, p: 0.55, fairOdds: 1.82 },
            ],
            marketGroups: [
              {
                group: "Resultado 1X2",
                rows: [
                  { market: asMarketKey("1x2"), selection: "home", label: "Local", p: 0.5, fairOdds: 2.0 },
                ],
              },
            ],
            mostLikelyScore: { home: 1, away: 1, p: 0.12 },
            factors: [{ key: "form", label: "Forma reciente", value: "3-1-1" }],
            steps: ["Estado causal", "Localia", "Calibracion", "Distribucion", "Verificacion", "Publicacion"],
          },
        },
        standings: [],
      });

    const plPath = path.join(plDir, "latest.json");
    fs.writeFileSync(plPath, JSON.stringify(makeSnap("pl-cut-1", "Arsenal")));
    const past = new Date(Date.now() - 10_000);
    fs.utimesSync(plPath, past, past);
    const initialPl = loadLeagueSnapshotEnvelope("premier-league");
    fs.writeFileSync(
      path.join(snapRoot, "shell-index.json"),
      JSON.stringify({
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        leagues: { "premier-league": initialPl },
      }),
    );

    clearSnapshotCausalityCachesForTests();
    const beforeMut = loadAllActiveLeagueSnapshots();
    expect(beforeMut["premier-league"].data?.games[0]?.id).toBe("pl-cut-1");

    fs.writeFileSync(plPath, JSON.stringify(makeSnap("pl-cut-2", "Arsenal FC")));
    const future = new Date(Date.now() + 8_000);
    fs.utimesSync(plPath, future, future);
    clearSnapshotCausalityCachesForTests();
    const afterMut = loadAllActiveLeagueSnapshots();
    expect(afterMut["premier-league"].data?.games[0]?.id).toBe("pl-cut-2");
  });

  it("loadPlayerPropStreakCards(36) omite ligas sin dateIso y loadServerPicksCatalogsForScreener carga selectivamente dentro del tope", async () => {
    clearPropsExplorerCachesForTests();
    const cards = loadPlayerPropStreakCards(36);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(36);
    for (const card of cards) {
      expect(card.series.length).toBeGreaterThan(0);
    }

    clearSnapshotCausalityCachesForTests();
    clearPlatformDataCachesForTests();
    expect(readShellIndexEntryFast()).not.toBeNull();

    const memberCatalogs: Record<string, MatchPicksCatalog> =
      await loadServerPicksCatalogsForScreener({ fullAccess: true });
    const visitorCatalogs: Record<string, MatchPicksCatalog> =
      await loadServerPicksCatalogsForScreener({ fullAccess: false });

    expect(Object.keys(memberCatalogs).length).toBeGreaterThan(0);
    expect(Object.keys(visitorCatalogs).length).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(memberCatalogs), "utf8")).toBeLessThanOrEqual(180 * 1024);
    expect(Buffer.byteLength(JSON.stringify(visitorCatalogs), "utf8")).toBeLessThanOrEqual(180 * 1024);

    const visitorUpcoming = Object.values(visitorCatalogs).find((c) => c.gameStatus !== "FT");
    expect(visitorUpcoming).toBeDefined();
    expect(visitorUpcoming!.isRedactedForVisitor).toBe(true);
  });
});
