import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  closingOdds,
  eq,
  funnelEvents,
  getAdminFunnelSummary,
  getCachedCortexSummary,
  listClosingOddsForGames,
  listPushSubscriptionsForUsers,
  listUserPushSubscriptions,
  pruneExpiredCortexCache,
  pushSubscriptions,
  recordFunnelEvent,
  sealedPicks,
  setCachedCortexSummary,
  upsertClosingOdds,
  upsertPushSubscription,
  users,
  type Db,
} from "../src/index";

let client: PGlite;
let db: Db;

beforeEach(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  await client.exec("SET pitchlab.allow_historical_seed = 'on'");
  db = drizzle(client) as unknown as Db;
});

async function createUser(email: string) {
  const [u] = await db.insert(users).values({ email }).returning();
  return u!;
}

async function expectImmutableRejected(
  promise: Promise<unknown>,
  codePattern?: RegExp,
): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  const detail = `${String(caught)} ${String((caught as { cause?: unknown })?.cause ?? "")}`;
  expect(detail).toMatch(/sealed_picks_immutable/);
  if (codePattern) {
    expect(detail).toMatch(codePattern);
  }
}

describe("migración 0024: parlays, cuotas de cierre, Cortex cache, push y embudo", () => {
  it("protege las nuevas columnas inmutables de parlays en sealed_picks con el trigger pick_immutable", async () => {
    const u = await createUser("parlay@example.com");
    const [row] = await db
      .insert(sealedPicks)
      .values({
        userId: u.id,
        pickId: "parlay:g1__p1+g2__p1",
        gameId: "g1",
        leagueLabel: "Combinada Multi-Liga",
        matchLabel: "2 selecciones",
        pickLabel: "Local A + Over 2.5 B",
        origin: "Parlay Combinado",
        units: "1.00",
        userDecimal: "3.450",
        fairDecimal: "3.100",
        sealHash: "b".repeat(64),
        sealedAt: new Date("2026-11-20T12:00:00Z"),
        kickoffAt: new Date("2026-11-20T20:00:00Z"),
        pickKind: "parlay",
        parlayLegs: [
          {
            pickId: "g1__p1",
            gameId: "g1",
            leagueLabel: "Liga MX",
            matchLabel: "América vs Pumas",
            pickLabel: "América gana",
            market: "h2h",
            selection: "home",
            line: null,
            p: 0.55,
            fairDecimal: 1.818,
            kickoffAt: "2026-11-20T20:00:00.000Z",
          },
          {
            pickId: "g2__p1",
            gameId: "g2",
            leagueLabel: "Premier League",
            matchLabel: "Arsenal vs Chelsea",
            pickLabel: "Más de 2.5 goles",
            market: "totals",
            selection: "over",
            line: 2.5,
            p: 0.58,
            fairDecimal: 1.724,
            kickoffAt: "2026-11-21T15:00:00.000Z",
          },
        ],
      })
      .returning();

    await expectImmutableRejected(
      db.update(sealedPicks).set({ pickKind: "single" }).where(eq(sealedPicks.id, row!.id)),
    );

    // Mientras esté pending, se pueden guardar resultados parciales de piernas.
    await db
      .update(sealedPicks)
      .set({
        parlayLegResults: [
          {
            pickId: "g1__p1",
            gameId: "g1",
            status: "won",
            homeScore: 2,
            awayScore: 1,
            closingDecimal: 1.92,
            clvPct: 1.56,
            settledAt: "2026-11-20T22:15:00.000Z",
          },
        ],
      })
      .where(eq(sealedPicks.id, row!.id));

    // Al cerrar estado final, ya no puede volver a modificarse.
    await db
      .update(sealedPicks)
      .set({
        status: "won",
        clvPct: "4.12",
        closingDecimal: "3.310",
        settledAt: new Date("2026-11-21T17:15:00Z"),
      })
      .where(eq(sealedPicks.id, row!.id));

    await expectImmutableRejected(
      db.update(sealedPicks).set({ closingDecimal: "2.900" }).where(eq(sealedPicks.id, row!.id)),
      /IMMUTABLE_SETTLED_PICK_UPDATE/,
    );
  });

  it("migración 0025: sin GUC histórico rechaza inserciones retroactivas post-kickoff, borrado directo y edición de filas liquidadas preservando ON DELETE CASCADE ARCO", async () => {
    await client.exec("SET pitchlab.allow_historical_seed = 'off'");
    const u = await createUser("inmutable-0025@example.com");

    await expectImmutableRejected(
      db.insert(sealedPicks).values({
        userId: u.id,
        pickId: "retro-g1__p1",
        gameId: "retro-g1",
        leagueLabel: "Liga MX",
        matchLabel: "América vs Pumas",
        pickLabel: "América gana",
        origin: "Spacetime Suite",
        units: "1.00",
        userDecimal: "2.050",
        fairDecimal: "1.950",
        sealHash: "c".repeat(64),
        sealedAt: new Date("2020-01-01T10:00:00Z"),
        kickoffAt: new Date("2020-01-01T12:00:00Z"),
      }),
      /RETROACTIVE_SEALED_PICK_FORBIDDEN/,
    );

    const futureKickoff = new Date(Date.now() + 24 * 3_600_000);
    const [livePick] = await db
      .insert(sealedPicks)
      .values({
        userId: u.id,
        pickId: "future-g1__p1",
        gameId: "future-g1",
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Chelsea",
        pickLabel: "Arsenal gana",
        origin: "Spacetime Suite",
        units: "1.50",
        userDecimal: "2.100",
        fairDecimal: "1.980",
        sealHash: "d".repeat(64),
        sealedAt: new Date("2020-01-01T10:00:00Z"),
        kickoffAt: futureKickoff,
      })
      .returning();

    expect(livePick).toBeDefined();
    expect(livePick!.sealedAt.getTime()).toBeGreaterThan(new Date("2025-01-01T00:00:00Z").getTime());

    await expectImmutableRejected(
      db.delete(sealedPicks).where(eq(sealedPicks.id, livePick!.id)),
      /IMMUTABLE_SEALED_PICK_DELETE/,
    );

    await expectImmutableRejected(
      db.update(sealedPicks).set({ clvPct: "1.50" }).where(eq(sealedPicks.id, livePick!.id)),
      /IMMUTABLE_PENDING_SETTLEMENT_FIELDS/,
    );

    await db
      .update(sealedPicks)
      .set({
        status: "won",
        clvPct: "3.20",
        closingDecimal: "1.980",
        settledAt: new Date(Date.now() + 26 * 3_600_000),
      })
      .where(eq(sealedPicks.id, livePick!.id));

    await expectImmutableRejected(
      db.update(sealedPicks).set({ status: "lost" }).where(eq(sealedPicks.id, livePick!.id)),
      /IMMUTABLE_SETTLED_PICK_UPDATE/,
    );

    await expectImmutableRejected(
      db.update(sealedPicks).set({ clvPct: "9.99" }).where(eq(sealedPicks.id, livePick!.id)),
      /IMMUTABLE_SETTLED_PICK_UPDATE/,
    );

    await db.delete(users).where(eq(users.id, u.id));
    expect(await db.select().from(sealedPicks).where(eq(sealedPicks.userId, u.id))).toHaveLength(0);
  });

  it("cuotas de cierre: conserva la captura pre-kickoff más reciente y rechaza post-kickoff", async () => {
    const ko = new Date("2026-11-20T20:00:00Z");
    const count = await upsertClosingOdds(db, [
      {
        gameId: "g1",
        market: "h2h",
        selection: "home",
        lineKey: "",
        book: "Pinnacle",
        decimalOdds: 2.05,
        fairDecimal: 1.98,
        noVigProb: 0.50505,
        source: "odds_refresh",
        kickoffAt: ko,
        capturedAt: new Date("2026-11-20T18:00:00Z"),
      },
      {
        gameId: "g1",
        market: "h2h",
        selection: "home",
        lineKey: "",
        book: "Pinnacle",
        decimalOdds: 2.15,
        fairDecimal: 2.08,
        noVigProb: 0.48077,
        source: "odds_refresh",
        kickoffAt: ko,
        capturedAt: new Date("2026-11-20T21:00:00Z"), // post-kickoff -> ignorada
      },
    ]);
    expect(count).toBe(1);

    await upsertClosingOdds(db, [
      {
        gameId: "g1",
        market: "h2h",
        selection: "home",
        lineKey: "",
        book: "Betfair",
        decimalOdds: 1.94,
        fairDecimal: 1.9,
        noVigProb: 0.52632,
        source: "odds_refresh",
        kickoffAt: ko,
        capturedAt: new Date("2026-11-20T19:55:00Z"),
      },
    ]);

    const loaded = await listClosingOddsForGames(db, ["g1"]);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.book).toBe("Betfair");
    expect(loaded[0]!.decimalOdds).toBe(1.94);
    expect((await db.select().from(closingOdds)).length).toBe(1);
  });

  it("cortex_cache: guarda lecturas, respeta expiración y limpia expiradas", async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    await setCachedCortexSummary(db, {
      cacheKey: "g1:hash1:model",
      gameId: "g1",
      factsHash: "hash1",
      model: "deepseek",
      summary: { headline: "Ventaja local" },
      expiresAt: new Date(now.getTime() + 3_600_000),
      now,
    });
    await setCachedCortexSummary(db, {
      cacheKey: "g2:old:model",
      gameId: "g2",
      factsHash: "old",
      model: "deepseek",
      summary: { headline: "Vencida" },
      expiresAt: new Date(now.getTime() - 1000),
      now,
    });

    expect(await getCachedCortexSummary(db, "g1:hash1:model", now)).toEqual({ headline: "Ventaja local" });
    expect(await getCachedCortexSummary(db, "g2:old:model", now)).toBeNull();
    await pruneExpiredCortexCache(db, now);
    expect(await getCachedCortexSummary(db, "g1:hash1:model", now)).toEqual({ headline: "Ventaja local" });
  });

  it("push_subscriptions y funnel_events: suscripciones por tema y embudo deduped", async () => {
    const u = await createUser("push@example.com");
    await upsertPushSubscription(db, {
      userId: u.id,
      endpoint: "https://push.example/sub/1",
      p256dh: "key-1",
      auth: "auth-1",
      topicPicks: true,
      topicLive: false,
      topicSocial: true,
    });

    expect(await listUserPushSubscriptions(db, u.id)).toHaveLength(1);
    expect(await listPushSubscriptionsForUsers(db, [u.id], "picks")).toHaveLength(1);
    expect(await listPushSubscriptionsForUsers(db, [u.id], "live")).toHaveLength(0);
    expect((await db.select().from(pushSubscriptions)).length).toBe(1);

    const t = new Date("2026-11-20T12:00:00Z");
    await recordFunnelEvent(db, { eventName: "landing", sessionKey: "sess-a", now: t });
    await recordFunnelEvent(db, { eventName: "landing", sessionKey: "sess-a", now: t }); // idempotente
    await recordFunnelEvent(db, { eventName: "signup_step1", sessionKey: "sess-a", now: t });
    await recordFunnelEvent(db, { eventName: "landing", sessionKey: "sess-b", now: t });

    const summary = await getAdminFunnelSummary(db, t, 30);
    expect(summary.stages[0]).toMatchObject({ stage: "landing", count30d: 2 });
    expect(summary.stages[1]).toMatchObject({
      stage: "signup_step1",
      count30d: 1,
      conversionFromPrevPct: 50,
    });
    expect((await db.select().from(funnelEvents)).length).toBe(3);
  });
});
