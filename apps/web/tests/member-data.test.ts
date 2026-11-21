import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, sealedPicks, users, type Db } from "@pitchlab/db";
import {
  canonicalSealPayload,
  listJournal,
  listWatchlist,
  profileIdForAuthUser,
  sealHashOf,
  sealPick,
  setWatched,
} from "../src/server/member-data";

let db: Db;
let userId: string;

function makeFuturePick(kickoffAt: Date) {
  return {
    pickId: "pl-1__p1",
    gameId: "pl-1",
    leagueLabel: "Premier League",
    matchLabel: "Chelsea vs Leeds",
    pickLabel: "Chelsea gana",
    origin: "Spacetime Suite",
    units: 1.5,
    userDecimal: 1.82,
    fairDecimal: 1.85,
    kickoffAt,
  };
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
  const [u] = await db.insert(users).values({ email: "s@example.com", authUserId: "auth_1" }).returning();
  userId = u!.id;
});

describe("datos del socio en la base", () => {
  it("encuentra el perfil por la cuenta de autenticación", async () => {
    expect(await profileIdForAuthUser(db, "auth_1")).toBe(userId);
    expect(await profileIdForAuthUser(db, "otro")).toBeNull();
  });

  it("vigilancia: agrega sin duplicar y quita", async () => {
    await setWatched(db, userId, "g1", true);
    await setWatched(db, userId, "g1", true);
    await setWatched(db, userId, "g2", true);
    expect((await listWatchlist(db, userId)).sort()).toEqual(["g1", "g2"]);
    await setWatched(db, userId, "g1", false);
    expect(await listWatchlist(db, userId)).toEqual(["g2"]);
  });

  it("bitácora: sella antes del inicio, una vez, con huella verificable", async () => {
    const now = new Date();
    const kickoffAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const afterKickoff = new Date(kickoffAt.getTime() + 1_000);
    const pick = makeFuturePick(kickoffAt);

    const first = await sealPick(db, userId, pick, now);
    expect(first.ok).toBe(true);
    expect(await sealPick(db, userId, pick, now)).toEqual({ ok: false, reason: "ya_sellado" });
    expect(await sealPick(db, userId, { ...pick, pickId: "p2" }, afterKickoff)).toEqual({
      ok: false,
      reason: "partido_iniciado",
    });
    expect(await sealPick(db, userId, { ...pick, pickId: "p3", units: 8 }, now)).toEqual({
      ok: false,
      reason: "unidades_invalidas",
    });

    const [row] = await listJournal(db, userId);
    expect(row!.sealedAt.toISOString()).toBe(now.toISOString());
    expect(row!.sealHash).toBe(sealHashOf(userId, pick, row!.sealedAt));
    expect(row!.sealHash).toBe(
      createHash("sha256").update(canonicalSealPayload(userId, pick, row!.sealedAt)).digest("hex"),
    );
    expect(sealHashOf(userId, { ...pick, pickLabel: "Leeds gana" }, row!.sealedAt)).not.toBe(row!.sealHash);

    let preSettledErr: unknown = null;
    try {
      await db.insert(sealedPicks).values({
        userId,
        pickId: "pre-settled-attack",
        gameId: "pl-2",
        leagueLabel: "Premier League",
        matchLabel: "Chelsea vs Leeds",
        pickLabel: "Chelsea gana",
        origin: "Spacetime Suite",
        units: "1.00",
        userDecimal: "2.000",
        fairDecimal: "1.950",
        status: "won",
        sealHash: "a".repeat(64),
        sealedAt: now,
        kickoffAt,
      });
    } catch (err) {
      preSettledErr = err;
    }
    expect(preSettledErr).not.toBeNull();
    const detail = `${String(preSettledErr)} ${String((preSettledErr as { cause?: unknown })?.cause ?? "")}`;
    expect(detail).toMatch(/PRE_SETTLED_INSERT_FORBIDDEN/);
  });
});
