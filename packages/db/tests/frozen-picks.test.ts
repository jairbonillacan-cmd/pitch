import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  getFrozenMatchMainPick,
  getOrFreezeMatchMainPick,
  type Db,
} from "../src/index";

let client: PGlite;
let db: Db;

const GAME_ID = "mx-2026-j16-queretaro-monterrey-401876988";
const KICKOFF = new Date("2026-11-14T23:00:00Z");

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
}, 120_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE match_frozen_picks");
});

afterAll(async () => {
  await client.close();
});

describe("pick principal congelado 60 min antes (migración 0020)", () => {
  it("no congela antes de los 60 minutos previos al saque inicial", async () => {
    const beforeBoundary = new Date("2026-11-14T21:59:59Z");
    const res = await getOrFreezeMatchMainPick(
      db,
      {
        gameId: GAME_ID,
        pickId: `${GAME_ID}__pick-1`,
        pickLabel: "Querétaro o empate",
        categoryLabel: "Doble oportunidad",
        marketGroup: "Doble oportunidad",
        selectionKey: "1x",
        probability: 0.654,
        fairDecimal: 1.529,
        fairAmerican: -189,
        kickoffAt: KICKOFF,
      },
      beforeBoundary,
    );
    expect(res).toBeNull();
    expect(await getFrozenMatchMainPick(db, GAME_ID)).toBeNull();
  });

  it("congela justo en el límite (T - 60 min) y no cambia aunque el motor recalcule después", async () => {
    const atBoundary = new Date("2026-11-14T22:00:00Z");
    const frozen = await getOrFreezeMatchMainPick(
      db,
      {
        gameId: GAME_ID,
        pickId: `${GAME_ID}__pick-1`,
        pickLabel: "Querétaro o empate",
        categoryLabel: "Doble oportunidad",
        marketGroup: "Doble oportunidad",
        selectionKey: "1x",
        probability: 0.654,
        fairDecimal: 1.529,
        fairAmerican: -189,
        kickoffAt: KICKOFF,
      },
      atBoundary,
    );
    expect(frozen).not.toBeNull();
    expect(frozen?.pickLabel).toBe("Querétaro o empate");
    expect(frozen?.probability).toBeCloseTo(0.654, 5);
    expect(frozen?.freezeAtIso).toBe("2026-11-14T22:00:00.000Z");

    // El motor vuelve a correr 30 min después con otro pick y otra probabilidad:
    const recalculated = await getOrFreezeMatchMainPick(
      db,
      {
        gameId: GAME_ID,
        pickId: `${GAME_ID}__pick-recalc`,
        pickLabel: "Monterrey gana",
        categoryLabel: "Resultado",
        marketGroup: "Resultado",
        selectionKey: "away",
        probability: 0.581,
        fairDecimal: 1.721,
        fairAmerican: -139,
        kickoffAt: KICKOFF,
      },
      new Date("2026-11-14T22:30:00Z"),
    );

    expect(recalculated?.pickId).toBe(`${GAME_ID}__pick-1`);
    expect(recalculated?.pickLabel).toBe("Querétaro o empate");
    expect(recalculated?.probability).toBeCloseTo(0.654, 5);
    expect(recalculated?.fairDecimal).toBeCloseTo(1.529, 3);
    expect(recalculated?.fairAmerican).toBe(-189);
  });
});
