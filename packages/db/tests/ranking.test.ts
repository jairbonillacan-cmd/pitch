import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  eq,
  castMatchVote,
  loadMatchResults,
  loadRankingParticipants,
  loadWinnerVotes,
  recordMatchResults,
  sealedPicks,
  upsertUserPreferences,
  users,
  winnerVoteTallies,
  type Db,
} from "../src/index";

let client: PGlite;
let db: Db;
const now = new Date("2026-11-12T12:00:00Z");

async function member(handle: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db
    .insert(users)
    .values({ email: `${handle}@example.com`, handle, displayName: handle, authUserId: `auth-${handle}`, isAdult: true, ...extra })
    .returning();
  return u!;
}

async function seal(userId: string, pickId: string, sealedAt: Date) {
  await db.insert(sealedPicks).values({
    userId,
    pickId,
    gameId: "g1",
    leagueLabel: "Liga MX",
    matchLabel: "A vs B",
    pickLabel: "Local",
    origin: "Spacetime Suite",
    units: "1",
    userDecimal: "2",
    fairDecimal: "1.9",
    clvPct: "1.5",
    status: "won",
    sealHash: "h".repeat(64),
    sealedAt,
    kickoffAt: new Date(sealedAt.getTime() + 3_600_000),
  });
}

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
}, 60_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users, match_results CASCADE");
});

afterAll(async () => {
  await client.close();
});

describe("loadRankingParticipants", () => {
  it("solo entran quienes aceptaron el ranking, con perfil público y sin pausa", async () => {
    const ana = await member("ana_mx");
    const privado = await member("privado", { publicProfile: false });
    const fuera = await member("fuera");
    await upsertUserPreferences(db, fuera.id, { showInRanking: false }, now);
    // showInRanking=false también apaga el perfil público; se vuelve a encender a mano.
    await db.update(users).set({ publicProfile: true }).where(eq(users.id, fuera.id));
    const pausa = await member("pausa");
    await upsertUserPreferences(db, pausa.id, { pauseCommunity: true }, now);
    await member("sin_cuenta", { authUserId: null });
    await member("menor", { isAdult: false });
    await seal(ana.id, "p1", new Date("2026-11-10T10:00:00Z"));
    await seal(ana.id, "p0", new Date("2026-09-01T10:00:00Z"));
    void privado;

    const all = await loadRankingParticipants(db);
    expect(all.map((p) => p.handle)).toEqual(["ana_mx"]);
    expect(all[0]!.picks).toHaveLength(2);
    expect(all[0]!.picks[0]).toMatchObject({ status: "won", userDecimal: 2, clvPct: 1.5 });

    const recent = await loadRankingParticipants(db, new Date("2026-10-13T00:00:00Z"));
    expect(recent[0]!.picks).toHaveLength(1);
  });
});

describe("resultados y votos", () => {
  it("guarda el resultado una sola vez y cuenta los votos de «¿Quién gana?»", async () => {
    await recordMatchResults(db, [{ gameId: "g1", home: 2, away: 1 }, { gameId: "mal id", home: 1, away: 0 }], now);
    await recordMatchResults(db, [{ gameId: "g1", home: 0, away: 3 }], now);
    expect(Object.fromEntries(await loadMatchResults(db))).toEqual({ g1: "home" });

    const a = await member("ana_mx");
    const b = await member("leo_mx");
    await castMatchVote(db, a.id, { gameId: "g1", question: "ganador", choice: "home" }, now);
    await castMatchVote(db, b.id, { gameId: "g1", question: "ganador", choice: "away" }, now);
    await castMatchVote(db, b.id, { gameId: "g1", question: "pick", choice: "si" }, now);

    expect(await winnerVoteTallies(db, ["g1", "g2"])).toEqual([{ gameId: "g1", home: 1, draw: 0, away: 1 }]);
    expect((await loadWinnerVotes(db, ["g1"])).map((v) => v.choice).sort()).toEqual(["away", "home"]);
  });
});
