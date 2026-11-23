import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  claimLiveRefresh,
  getProviderLinks,
  listFollowedGames,
  listLiveAlertsForUser,
  liveMatchEvents,
  providerQuotaToday,
  readLiveCache,
  recordLiveMoments,
  recordProviderRequest,
  releaseLiveRefresh,
  saveProviderLinks,
  setFollowedGame,
  users,
  writeLiveCache,
  type Db,
} from "../src/index";

let client: PGlite;
let db: Db;
const t0 = new Date("2026-11-14T23:05:00Z");
const GAME = "mx-2026-j16-queretaro-monterrey-401876988";
const OTHER = "pl-2026-27-md10-everton-coventry-city";

async function member(handle: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${handle}@example.com`, handle, displayName: handle, authUserId: `auth-${handle}`, isAdult: true })
    .returning();
  return u!;
}

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
}, 120_000);

beforeEach(async () => {
  await client.exec(
    "TRUNCATE TABLE live_feed_cache, provider_quota, provider_match_links, live_match_events, watchlist, users CASCADE",
  );
});

afterAll(async () => {
  await client.close();
});

describe("caché compartida del lector en vivo", () => {
  it("solo una instancia toma el turno de refrescar y las demás leen la caché", async () => {
    expect(await readLiveCache(db, "live:scoreboard", t0)).toBeNull();
    expect(await claimLiveRefresh(db, "live:scoreboard", t0, 8_000)).toBe(true);
    // Otra instancia, un segundo después: el arriendo sigue vigente.
    expect(await claimLiveRefresh(db, "live:scoreboard", new Date(t0.getTime() + 1_000), 8_000)).toBe(false);
    expect(await readLiveCache(db, "live:scoreboard", t0)).toBeNull();

    await writeLiveCache(db, "live:scoreboard", { games: [1] }, t0, 15_000);
    const fresh = await readLiveCache<{ games: number[] }>(db, "live:scoreboard", new Date(t0.getTime() + 5_000));
    expect(fresh?.payload.games).toEqual([1]);
    expect(fresh?.fresh).toBe(true);
    const stale = await readLiveCache(db, "live:scoreboard", new Date(t0.getTime() + 20_000));
    expect(stale?.fresh).toBe(false);
    // Escribir libera el arriendo.
    expect(await claimLiveRefresh(db, "live:scoreboard", new Date(t0.getTime() + 2_000), 8_000)).toBe(true);
    await releaseLiveRefresh(db, "live:scoreboard");
    expect(await claimLiveRefresh(db, "live:scoreboard", new Date(t0.getTime() + 2_500), 8_000)).toBe(true);
  });

  it("rechaza llaves raras", async () => {
    await expect(readLiveCache(db, "X; drop", t0)).rejects.toThrow();
  });

  it("cuenta las peticiones del día y guarda lo restante que reporta el proveedor", async () => {
    await recordProviderRequest(db, "bzzoiro", t0, 7213);
    await recordProviderRequest(db, "bzzoiro", t0, null);
    expect(await providerQuotaToday(db, "bzzoiro", t0)).toEqual({ requests: 2, remaining: 7213 });
    // Al día siguiente (UTC) empieza de cero.
    expect(await providerQuotaToday(db, "bzzoiro", new Date("2026-11-15T00:00:01Z"))).toEqual({
      requests: 0,
      remaining: null,
    });
  });
});

describe("mapeo de ids del proveedor", () => {
  it("guarda el id propio y nunca deja que un evento apunte a dos partidos", async () => {
    await saveProviderLinks(
      db,
      "bzzoiro",
      [
        { gameId: GAME, providerEventId: "123456", method: "kickoff+teams" },
        { gameId: OTHER, providerEventId: "123456", method: "kickoff+teams" },
        { gameId: "x; drop", providerEventId: "1", method: "kickoff+teams" },
      ],
      t0,
    );
    const links = await getProviderLinks(db, "bzzoiro", [GAME, OTHER]);
    expect(links.get(GAME)).toBe("123456");
    expect(links.has(OTHER)).toBe(false);
  });
});

describe("«Siguiendo» y avisos", () => {
  it("guarda partidos seguidos con sus avisos y solo avisa lo que el socio pidió", async () => {
    const ana = await member("ana_mx");
    const beto = await member("beto_mx");
    await setFollowedGame(db, ana.id, GAME, true);
    await setFollowedGame(db, beto.id, GAME, true, { goals: false });
    expect(await setFollowedGame(db, ana.id, "bad id!", true)).toEqual({ ok: false, reason: "invalid" });

    expect(await listFollowedGames(db, beto.id)).toEqual([
      { gameId: GAME, alerts: { kickoff: true, goals: false, final: true } },
    ]);

    const inserted = await recordLiveMoments(
      db,
      [
        { gameId: GAME, kind: "kickoff", side: null, minute: 1, homeScore: 0, awayScore: 0 },
        { gameId: GAME, kind: "goal", side: "away", minute: 34, homeScore: 0, awayScore: 1 },
        { gameId: OTHER, kind: "goal", side: "home", minute: 10, homeScore: 1, awayScore: 0 },
      ],
      t0,
    );
    expect(inserted).toBe(3);
    // El mismo gol visto por otra lectura no se duplica.
    expect(
      await recordLiveMoments(
        db,
        [{ gameId: GAME, kind: "goal", side: "away", minute: 35, homeScore: 0, awayScore: 1 }],
        new Date(t0.getTime() + 10_000),
      ),
    ).toBe(0);

    const since = new Date(t0.getTime() - 60_000);
    const anaAlerts = await listLiveAlertsForUser(db, ana.id, since);
    expect(anaAlerts.map((a) => a.kind).sort()).toEqual(["goal", "kickoff"]);
    expect(anaAlerts.every((a) => a.gameId === GAME)).toBe(true);
    const betoAlerts = await listLiveAlertsForUser(db, beto.id, since);
    expect(betoAlerts.map((a) => a.kind)).toEqual(["kickoff"]);

    // Dejar de seguir apaga los avisos.
    await setFollowedGame(db, ana.id, GAME, false);
    expect(await listLiveAlertsForUser(db, ana.id, since)).toEqual([]);
  });

  it("acota listLiveAlertsForUser a un máximo de 40 alertas aunque existan más de 50", async () => {
    const fan = await member("fan_alerts");
    await setFollowedGame(db, fan.id, GAME, true, { kickoff: true, goals: true, final: true });

    const totalAlerts = 55;
    await db.insert(liveMatchEvents).values(
      Array.from({ length: totalAlerts }, (_, i) => ({
        gameId: GAME,
        kind: "goal",
        side: "home",
        minute: i + 1,
        homeScore: i + 1,
        awayScore: 0,
        dedupeKey: `${GAME}:goal:${i + 1}-0`,
        occurredAt: new Date(t0.getTime() + (i + 1) * 1_000),
      })),
    );

    const since = new Date(t0.getTime() - 60_000);
    const defaultAlerts = await listLiveAlertsForUser(db, fan.id, since);
    expect(defaultAlerts).toHaveLength(40);
    expect(defaultAlerts[0]?.homeScore).toBe(totalAlerts);
    expect(defaultAlerts[39]?.homeScore).toBe(totalAlerts - 39);

    const cappedAlerts = await listLiveAlertsForUser(db, fan.id, since, 100);
    expect(cappedAlerts).toHaveLength(40);
    expect(cappedAlerts[0]?.homeScore).toBe(totalAlerts);

    const smallAlerts = await listLiveAlertsForUser(db, fan.id, since, 10);
    expect(smallAlerts).toHaveLength(10);
  });
});
