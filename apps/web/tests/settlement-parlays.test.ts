import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  applyMigrations,
  completeSignup,
  eq,
  funnelEvents,
  grantDays,
  sealedPicks,
  setEmailPreferences,
  SIGNUP_CONSENT_VERSION,
  upsertClosingOdds,
  users,
  type Db,
} from "@pitchlab/db";
import type { MatchPick, PlatformDataset, PlatformGame } from "@pitchlab/ui";
import { sealPick } from "../src/server/member-data";
import type { Mailer, OutgoingEmail } from "../src/server/mailer";
import { gradeSelection, loadFinalMatchScores, runPickSettlement } from "../src/server/settlement";
import { GET as settleCronGet } from "../app/api/cron/settle-picks/route";
import { POST as postJournal } from "../app/api/me/journal/route";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";
import { setMailerForTests } from "../src/server/mailer";

const mockPlatformState = vi.hoisted(() => ({ dataset: null as PlatformDataset | null }));

vi.mock("../src/server/platform-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/platform-data")>();
  return {
    ...actual,
    buildServerRawPlatformDataset: () => mockPlatformState.dataset ?? actual.buildServerRawPlatformDataset(),
  };
});

let pgClient: PGlite;
let db: Db;
const sent: OutgoingEmail[] = [];

const fakeMailer: Mailer = {
  async send(email) {
    sent.push(email);
    return { id: `mail-${sent.length}` };
  },
  async cancel() {},
};

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  db = drizzle(pgClient) as unknown as Db;
});

beforeEach(async () => {
  await pgClient.exec("TRUNCATE TABLE users, closing_odds, match_results, push_subscriptions, funnel_events CASCADE");
  sent.length = 0;
  mockPlatformState.dataset = null;
  resetAuthForTests(undefined);
  resetRateLimitsForTests();
  setSessionDbForTests(null);
  setMailerForTests(null);
});

afterAll(async () => {
  mockPlatformState.dataset = null;
  resetAuthForTests(undefined);
  setSessionDbForTests(null);
  setMailerForTests(null);
  await pgClient.close();
});

describe("Liquidación automática, CLV de cierre y Parlays", () => {
  it("califica selecciones simples incluyendo push (void) en líneas enteras y DNB", () => {
    expect(gradeSelection({ market: "totals", selection: "over_2", line: 2 }, 1, 1)).toBe("void");
    expect(gradeSelection({ market: "totals", selection: "over_2.5", line: 2.5 }, 2, 1)).toBe("won");
    expect(gradeSelection({ market: "totals", selection: "under_2.5", line: 2.5 }, 2, 1)).toBe("lost");
    expect(gradeSelection({ market: "dnb", selection: "home" }, 1, 1)).toBe("void");
    expect(gradeSelection({ market: "dnb", selection: "home" }, 2, 0)).toBe("won");
    expect(gradeSelection({ market: "spreads", selection: "home", line: -1 }, 2, 1)).toBe("void");
    expect(gradeSelection({ market: "spreads", selection: "away", line: 1 }, 2, 1)).toBe("void");
    expect(gradeSelection({ market: "btts", selection: "yes" }, 1, 2)).toBe("won");
    expect(gradeSelection({ pickLabel: "Empate" }, 0, 0)).toBe("won");
  });

  it("lee marcadores finales desde snapshots y archivos JSONL históricos", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pl-settle-"));
    try {
      const snapDir = path.join(root, "snapshots", "epl");
      const histDir = path.join(root, "history");
      mkdirSync(snapDir, { recursive: true });
      mkdirSync(histDir, { recursive: true });

      writeFileSync(
        path.join(snapDir, "2026-11-10.json"),
        JSON.stringify({
          schemaVersion: 1,
          league: "premier-league",
          season: "2026-27",
          seasonLabel: "2026-27",
          periodLabel: "Jornada 11",
          updatedAt: "2026-11-10T22:00:00Z",
          source: "test-fixture",
          provenance: "provider",
          isDemo: false,
          teamRates: {},
          analyses: {},
          games: [
            {
              id: "premier-league-20261110-ars-che",
              league: "premier-league",
              season: "2026-27",
              sport: "soccer",
              round: "Jornada 11",
              startTime: "2026-11-10T18:00:00Z",
              status: "final",
              neutralSite: false,
              home: { id: "premier-league.arsenal", league: "premier-league", name: "Arsenal", shortName: "ARS", code: "ARS" },
              away: { id: "premier-league.chelsea", league: "premier-league", name: "Chelsea", shortName: "CHE", code: "CHE" },
              result: { home: 2, away: 1, observedAt: "2026-11-10T20:00:00Z", source: "test-fixture" },
            },
          ],
        }),
      );
      writeFileSync(
        path.join(histDir, "liga-mx.jsonl"),
        `${JSON.stringify({ id: "ligamx-hist-01", homeScore: 1, awayScore: 1, availableAt: "2026-11-09T23:00:00Z" })}\n`,
      );

      const scores = loadFinalMatchScores(path.join(root, "snapshots"), histDir);
      expect(scores.get("premier-league-20261110-ars-che")).toMatchObject({ home: 2, away: 1 });
      expect(scores.get("ligamx-hist-01")).toMatchObject({ home: 1, away: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("congela cuotas de cierre pre-kickoff, califica simples + parlays parcialmente y notifica una sola vez", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pl-run-"));
    try {
      const snapDir = path.join(root, "snapshots", "epl");
      const histDir = path.join(root, "history");
      mkdirSync(snapDir, { recursive: true });
      mkdirSync(histDir, { recursive: true });

      const [user] = await db
        .insert(users)
        .values({ email: "parlay@pitchlab.mx", displayName: "Jair Parlay", handle: "jairparlay" })
        .returning({ id: users.id });
      await setEmailPreferences(db, user!.id, { pickResults: true });

      const sealTime = new Date("2026-11-09T10:00:00Z");
      const k1 = new Date("2026-11-10T18:00:00Z");
      const k2 = new Date("2026-11-10T20:30:00Z");

      // Cuota de cierre pre-kickoff válida vs post-kickoff ignorada.
      await upsertClosingOdds(db, [
        {
          gameId: "epl-g1",
          market: "h2h",
          selection: "home",
          lineKey: "",
          book: "pinnacle",
          decimalOdds: 2.0,
          fairDecimal: 2.05,
          source: "test_closing",
          kickoffAt: k1,
          capturedAt: new Date("2026-11-10T17:55:00Z"),
        },
        {
          gameId: "epl-g1",
          market: "h2h",
          selection: "home",
          lineKey: "",
          book: "late",
          decimalOdds: 9.0,
          fairDecimal: 9.0,
          source: "test_closing",
          kickoffAt: k1,
          capturedAt: new Date("2026-11-10T18:10:00Z"), // Después del kickoff: ignorada
        },
      ]);

      // 1) Pick simple
      const single = await sealPick(
        db,
        user!.id,
        {
          pickId: "pick-single-1",
          gameId: "epl-g1",
          leagueLabel: "Premier League",
          matchLabel: "Arsenal vs Chelsea",
          pickLabel: "Arsenal gana",
          origin: "Spacetime Suite",
          pickKind: "single",
          pickMarket: "h2h",
          pickSelection: "home",
          units: 1.5,
          userDecimal: 2.25,
          fairDecimal: 2.1,
          kickoffAt: k1,
        },
        sealTime,
      );
      expect(single.ok).toBe(true);

      // 2) Parlay de 2 patas (epl-g1 + epl-g2)
      const parlay = await sealPick(
        db,
        user!.id,
        {
          pickId: "parlay:p1+p2",
          gameId: "epl-g1",
          leagueLabel: "Combinada Multi-Liga",
          matchLabel: "2 selecciones",
          pickLabel: "Arsenal gana + Más de 2.5",
          origin: "Parlay Combinado",
          pickKind: "parlay",
          parlayLegs: [
            {
              pickId: "p1",
              gameId: "epl-g1",
              leagueLabel: "Premier League",
              matchLabel: "Arsenal vs Chelsea",
              pickLabel: "Arsenal gana",
              market: "h2h",
              selection: "home",
              line: null,
              p: 0.48,
              fairDecimal: 2.1,
              kickoffAt: k1.toISOString(),
            },
            {
              pickId: "p2",
              gameId: "epl-g2",
              leagueLabel: "Premier League",
              matchLabel: "Liverpool vs Spurs",
              pickLabel: "Más de 2.5 goles",
              market: "totals",
              selection: "over_2.5",
              line: 2.5,
              p: 0.55,
              fairDecimal: 1.82,
              kickoffAt: k2.toISOString(),
            },
          ],
          units: 1,
          userDecimal: 3.9,
          fairDecimal: 3.82,
          kickoffAt: k1,
        },
        sealTime,
      );
      expect(parlay.ok).toBe(true);

      // Solo epl-g1 ha terminado por ahora -> simple se liquida, parlay guarda pata 1 parcial.
      writeFileSync(
        path.join(histDir, "epl.jsonl"),
        `${JSON.stringify({ id: "epl-g1", homeScore: 2, awayScore: 1 })}\n`,
      );

      const firstRun = await runPickSettlement(db, fakeMailer, {
        now: new Date("2026-11-10T20:15:00Z"),
        snapshotsRoot: path.join(root, "snapshots"),
        historyRoot: histDir,
      });
      expect(firstRun.settledSingles).toBe(1);
      expect(firstRun.settledParlays).toBe(0);
      expect(firstRun.updatedPartialParlays).toBe(1);
      expect(sent).toHaveLength(1);

      const rowsAfterFirst = await db.select().from(sealedPicks).where(eq(sealedPicks.userId, user!.id));
      const singleRow = rowsAfterFirst.find((r) => r.pickId === "pick-single-1");
      const parlayRowPartial = rowsAfterFirst.find((r) => r.pickId === "parlay:p1+p2");
      expect(singleRow?.status).toBe("won");
      expect(Number(singleRow?.closingDecimal)).toBeCloseTo(2.05, 2);
      // CLV = (2.25 / 2.05 - 1) * 100 = +9.76%
      expect(Number(singleRow?.clvPct)).toBeCloseTo(9.76, 1);
      expect(parlayRowPartial?.status).toBe("pending");
      expect(parlayRowPartial?.parlayLegResults).toHaveLength(1);
      expect(parlayRowPartial?.parlayLegResults?.[0]?.status).toBe("won");

      // Termina epl-g2 con 3 goles -> parlay gana y se notifica.
      writeFileSync(
        path.join(histDir, "epl.jsonl"),
        `${JSON.stringify({ id: "epl-g1", homeScore: 2, awayScore: 1 })}\n${JSON.stringify({ id: "epl-g2", homeScore: 2, awayScore: 1 })}\n`,
      );

      const settledEvents: Array<{ status: string; pickLabel: string }> = [];
      const secondRun = await runPickSettlement(db, fakeMailer, {
        now: new Date("2026-11-10T22:45:00Z"),
        snapshotsRoot: path.join(root, "snapshots"),
        historyRoot: histDir,
        onSettled: async (ev) => {
          settledEvents.push({ status: ev.status, pickLabel: ev.pickLabel });
        },
      });
      expect(secondRun.settledSingles).toBe(0);
      expect(secondRun.settledParlays).toBe(1);
      expect(sent).toHaveLength(2);
      expect(settledEvents).toEqual([{ status: "won", pickLabel: "Arsenal gana + Más de 2.5" }]);

      // Tercer run es idempotente.
      const thirdRun = await runPickSettlement(db, fakeMailer, {
        now: new Date("2026-11-10T23:00:00Z"),
        snapshotsRoot: path.join(root, "snapshots"),
        historyRoot: histDir,
      });
      expect(thirdRun.checkedPending).toBe(0);
      expect(sent).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("protege /api/cron/settle-picks con Bearer CRON_SECRET", async () => {
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-test-secret-value";
    setSessionDbForTests(db);
    setMailerForTests(fakeMailer);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const noAuth = await settleCronGet(new Request("https://pitchlab.mx/api/cron/settle-picks"));
      expect(noAuth.status).toBe(401);

      const badAuth = await settleCronGet(
        new Request("https://pitchlab.mx/api/cron/settle-picks", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      );
      expect(badAuth.status).toBe(401);

      const okRes = await settleCronGet(
        new Request("https://pitchlab.mx/api/cron/settle-picks", {
          headers: { authorization: "Bearer cron-test-secret-value" },
        }),
      );
      expect(okRes.status).toBe(200);
      const body = (await okRes.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } finally {
      consoleSpy.mockRestore();
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
    }
  });

  it("valida parlays en POST /api/me/journal (409 en incompatibles/iniciados, sellado en Neon y evento first_sealed_pick)", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    try {
      const [inserted] = await db
        .insert(users)
        .values({
          authUserId: "auth_parlay_route",
          email: "parlay-route@pitchlab.mx",
          displayName: "Socio Parlay",
          handle: "socio_parlay",
          isAdult: true,
        })
        .returning({ id: users.id });
      const userId = inserted!.id;

      const now = new Date();
      const signup = await completeSignup(db, {
        userId,
        displayName: "Socio Parlay",
        handle: "socio_parlay",
        birthDate: "1994-05-12",
        termsVersion: SIGNUP_CONSENT_VERSION,
        analyticsConsent: true,
        marketingConsent: false,
        referralCode: null,
        trial: null,
        now,
      });
      expect(signup.ok).toBe(true);

      await grantDays(db, {
        userId,
        sourceKind: "admin_grant",
        days: 7,
        idempotencyKey: "parlay-route-test-grant",
        now,
      });

      setSessionDbForTests(db);
      resetAuthForTests({
        api: {
          getSession: async () => ({
            user: {
              id: "auth_parlay_route",
              email: "parlay-route@pitchlab.mx",
              name: "Socio Parlay",
              emailVerified: true,
            },
          }),
        },
      } as unknown as PitchLabAuth);

      const makePick = (
        gameId: string,
        id: string,
        label: string,
        p: number,
        extra: Partial<MatchPick> = {},
      ): MatchPick =>
        ({
          id,
          gameId,
          engineKey: "singularity",
          engineName: "Spacetime Suite",
          marketGroup: "1X2",
          selectionKey: "home",
          market: "h2h",
          line: null,
          conflictGroup: "home_side",
          label,
          rationale: "Lectura de prueba",
          p,
          fairDecimal: Number((1 / p).toFixed(3)),
          fairAmerican: -100,
          marketDecimal: null,
          marketAmerican: null,
          ...extra,
        }) as MatchPick;

      const makeGame = (id: string, kickoffIso: string, status: PlatformGame["status"], picks: MatchPick[]): PlatformGame =>
        ({
          id,
          league: "premier-league" as PlatformGame["league"],
          leagueLabel: "Premier League",
          sport: "football",
          round: "J12",
          dayId: kickoffIso.slice(0, 10),
          dayLabel: "sábado",
          kickoffUtc: kickoffIso,
          kickoffLocal: "14:00",
          venue: "Estadio Test",
          status,
          home: { slug: `${id}-h`, name: "Local Test", shortName: "LOC", code: "LOC", record: "" },
          away: { slug: `${id}-a`, name: "Visita Test", shortName: "VIS", code: "VIS", record: "" },
          x12: [0.5, 0.25, 0.25],
          projection: { home: 1.8, away: 1.1, total: 2.9 },
          confidenceScore: 72,
          confidenceLevel: "media",
          picks,
          preGame: {} as PlatformGame["preGame"],
          markets: [],
          factors: [],
          headToHead: [],
          updatedAtLabel: "",
          spacetime: null,
        }) as PlatformGame;

      const futureA = new Date(Date.now() + 6 * 3600_000).toISOString();
      const futureB = new Date(Date.now() + 8 * 3600_000).toISOString();
      const pastC = new Date(Date.now() - 2 * 3600_000).toISOString();

      mockPlatformState.dataset = {
        generatedAt: new Date().toISOString(),
        leagues: [],
        games: [
          makeGame("epl-future-1", futureA, "NS", [
            makePick("epl-future-1", "p-g1-home", "Local Test gana", 0.5, {
              conflictGroup: "home_side",
              market: "h2h",
              selectionKey: "home",
            }),
            makePick("epl-future-1", "p-g1-away", "Visita Test gana", 0.25, {
              conflictGroup: "away_side",
              market: "h2h",
              selectionKey: "away",
            }),
          ]),
          makeGame("epl-future-2", futureB, "NS", [
            makePick("epl-future-2", "p-g2-over", "Más de 2.5 goles", 0.55, {
              conflictGroup: "over_total",
              market: "totals",
              selectionKey: "over_2.5",
              line: 2.5,
            }),
          ]),
          makeGame("epl-started-3", pastC, "LIVE", [
            makePick("epl-started-3", "p-g3-home", "Local iniciado gana", 0.6, {
              conflictGroup: "home_side",
              market: "h2h",
              selectionKey: "home",
            }),
          ]),
        ],
        dailyPromoPickId: "",
        tipsterWeeklyPickId: "",
        tipsterWeeklySlug: "",
        isServerRedactedForVisitor: false,
      };

      const postReq = (payload: Record<string, unknown>) =>
        postJournal(
          new Request("http://localhost:3000/api/me/journal", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "http://localhost:3000",
            },
            body: JSON.stringify(payload),
          }),
        );

      // 1) Patas incompatibles del mismo partido -> 409 parlay_invalido
      const conflictRes = await postReq({
        gameId: "epl-future-1",
        pickId: "parlay:p-g1-home+p-g1-away",
        pickKind: "parlay",
        parlayLegs: [
          { gameId: "epl-future-1", pickId: "p-g1-home" },
          { gameId: "epl-future-1", pickId: "p-g1-away" },
        ],
        units: 1,
        userDecimal: 5.5,
      });
      expect(conflictRes.status).toBe(409);
      expect(await conflictRes.json()).toMatchObject({ ok: false, reason: "parlay_invalido" });

      // 2) Pata con partido ya iniciado -> 409 partido_iniciado
      const startedRes = await postReq({
        gameId: "epl-future-1",
        pickId: "parlay:p-g1-home+p-g3-home",
        pickKind: "parlay",
        parlayLegs: [
          { gameId: "epl-future-1", pickId: "p-g1-home" },
          { gameId: "epl-started-3", pickId: "p-g3-home" },
        ],
        units: 1,
        userDecimal: 3.1,
      });
      expect(startedRes.status).toBe(409);
      expect(await startedRes.json()).toMatchObject({ ok: false, reason: "partido_iniciado" });

      // 3) Parlay válido de 2 patas: deriva fairDecimal del servidor (ignora fairDecimal=99 del cliente) y registra embudo
      const validRes = await postReq({
        gameId: "epl-future-1",
        pickId: "parlay:p-g1-home+p-g2-over",
        pickKind: "parlay",
        parlayLegs: [
          { gameId: "epl-future-1", pickId: "p-g1-home" },
          { gameId: "epl-future-2", pickId: "p-g2-over" },
        ],
        units: 1.5,
        userDecimal: 3.8,
        fairDecimal: 99,
      });
      expect(validRes.status).toBe(201);
      const validBody = (await validRes.json()) as { ok: boolean; id: string };
      expect(validBody.ok).toBe(true);

      const [savedPick] = await db.select().from(sealedPicks).where(eq(sealedPicks.userId, userId));
      expect(savedPick).toMatchObject({
        pickKind: "parlay",
        status: "pending",
      });
      expect(savedPick?.parlayLegs).toHaveLength(2);
      expect(Number(savedPick?.fairDecimal)).toBeLessThan(10);
      expect(Number(savedPick?.fairDecimal)).toBeGreaterThan(3);

      const funnelRows = await db.select().from(funnelEvents).where(eq(funnelEvents.userId, userId));
      expect(funnelRows.some((r) => r.eventName === "first_sealed_pick")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
