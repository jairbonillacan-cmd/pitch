import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
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
  await client.exec("SET pitchlab.allow_historical_seed = 'on'");
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

  it("acota en SQL a <=40 participantes priorizando mejor rendimiento con >45 elegibles", async () => {
    const insertedUsers = await db
      .insert(users)
      .values(
        Array.from({ length: 50 }, (_, idx) => {
          const suffix = String(idx).padStart(2, "0");
          const handle = `socio_${suffix}`;
          return {
            email: `${handle}@example.com`,
            handle,
            displayName: handle,
            authUserId: `auth-${handle}`,
            isAdult: true,
            publicProfile: true,
          };
        }),
      )
      .returning({ id: users.id, handle: users.handle });

    const orderedUsers = [...insertedUsers].sort((a, b) => a.handle!.localeCompare(b.handle!));
    const sealedAt = new Date("2026-11-10T10:00:00Z");
    const kickoffAt = new Date("2026-11-10T12:00:00Z");

    await db.insert(sealedPicks).values(
      orderedUsers.map((u, idx) => ({
        userId: u.id,
        pickId: `p-rank-${idx}`,
        gameId: "g1",
        leagueLabel: "Liga MX",
        matchLabel: "A vs B",
        pickLabel: "Local",
        origin: "Spacetime Suite",
        units: "1.00",
        userDecimal: (1.1 + idx * 0.1).toFixed(3),
        fairDecimal: "1.900",
        clvPct: "1.50",
        status: "won",
        sealHash: "h".repeat(64),
        sealedAt,
        kickoffAt,
      })),
    );

    const since = new Date("2026-10-13T00:00:00Z");
    const defaultTop = await loadRankingParticipants(db, since);
    expect(defaultTop.length).toBeLessThanOrEqual(40);
    expect(defaultTop).toHaveLength(40);
    expect(defaultTop[0]!.handle).toBe("socio_49");
    expect(defaultTop[39]!.handle).toBe("socio_10");
    expect(defaultTop.some((p) => p.handle === "socio_00")).toBe(false);

    const capped = await loadRankingParticipants(db, since, 100);
    expect(capped).toHaveLength(40);

    const topTen = await loadRankingParticipants(db, since, 10);
    expect(topTen).toHaveLength(10);
    expect(topTen[0]!.handle).toBe("socio_49");
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

describe("perfil público y ranking", () => {
  it("salir del ranking no vuelve privado el perfil; un perfil privado nunca está en el ranking", async () => {
    const ana = await member("ana_mx");
    const out = await upsertUserPreferences(db, ana.id, { showInRanking: false }, now);
    expect(out).toMatchObject({ showInRanking: false, publicRecordVisible: true });

    const back = await upsertUserPreferences(db, ana.id, { showInRanking: true }, now);
    expect(back.showInRanking).toBe(true);

    const hidden = await upsertUserPreferences(db, ana.id, { publicRecordVisible: false }, now);
    expect(hidden).toMatchObject({ publicRecordVisible: false, showInRanking: false });
    const forced = await upsertUserPreferences(db, ana.id, { showInRanking: true }, now);
    expect(forced.showInRanking).toBe(false);
    expect(await loadRankingParticipants(db)).toEqual([]);
  });
});
