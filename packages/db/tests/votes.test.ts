import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, castMatchVote, matchVoteTally, users, type Db } from "../src/index";

let client: PGlite;
let db: Db;
const now = new Date("2026-11-13T12:00:00Z");
const GAME = "mx-2026-j16-queretaro-monterrey-401876988";

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
  db = drizzle(client) as unknown as Db;
}, 120_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE match_votes, users CASCADE");
});

afterAll(async () => {
  await client.close();
});

describe("votos de la comunidad por partido", () => {
  it("cuenta un voto por socio y pregunta, y deja cambiarlo", async () => {
    const ana = await member("ana_mx");
    const beto = await member("beto_mx");
    await castMatchVote(db, ana.id, { gameId: GAME, question: "ganador", choice: "home" }, now);
    await castMatchVote(db, beto.id, { gameId: GAME, question: "ganador", choice: "away" }, now);
    await castMatchVote(db, ana.id, { gameId: GAME, question: "pick", choice: "si" }, now);
    // Ana cambia de opinión: sigue habiendo un solo voto suyo.
    await castMatchVote(db, ana.id, { gameId: GAME, question: "ganador", choice: "draw" }, now);

    const t = await matchVoteTally(db, GAME, ana.id);
    expect(t.ganador).toEqual({ home: 0, draw: 1, away: 1 });
    expect(t.pick).toEqual({ si: 1, no: 0 });
    expect(t.mine).toEqual({ ganador: "draw", pick: "si" });

    const anon = await matchVoteTally(db, GAME, null);
    expect(anon.mine).toEqual({ ganador: null, pick: null });
  });

  it("rechaza preguntas, opciones o partidos inválidos", async () => {
    const ana = await member("ana_mx");
    expect(await castMatchVote(db, ana.id, { gameId: GAME, question: "pick", choice: "home" }, now)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await castMatchVote(db, ana.id, { gameId: "x; drop table", question: "pick", choice: "si" }, now),
    ).toEqual({ ok: false, reason: "invalid" });
    const t = await matchVoteTally(db, GAME, ana.id);
    expect(t.pick).toEqual({ si: 0, no: 0 });
  });
});
