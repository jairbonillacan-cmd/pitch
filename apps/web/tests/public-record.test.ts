import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, eq, sealedPicks, users, type Db } from "@pitchlab/db";
import { GET as getPreferences, PUT as putPreferences } from "../app/api/me/preferences/route";
import { GET as getPublicRecordRoute } from "../app/api/u/[handle]/record/route";
import { sealPick } from "../src/server/member-data";
import { loadPublicRecord } from "../src/server/public-record";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createDb: vi.fn(),
}));

vi.mock("../src/server/session-user", () => ({ requireMember: mocks.requireMember }));
vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  createDb: mocks.createDb,
}));

let client: PGlite;
let db: Db;
let userId: string;

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
});

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users CASCADE;");
  const [u] = await db
    .insert(users)
    .values({
      email: "ana@example.com",
      authUserId: "auth_ana",
      handle: "ana_mx",
      displayName: "Ana",
      isAdult: true,
      publicProfile: true,
    })
    .returning();
  userId = u!.id;
  mocks.requireMember.mockResolvedValue({ db, userId });
  mocks.createDb.mockReturnValue(db);
  vi.stubEnv("DATABASE_URL", "postgres://stub");
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

const prefsPutRequest = (body: unknown) =>
  new Request("http://localhost:9990/api/me/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "http://localhost:9990" },
  });

describe("Mi récord: preferencias, banca privada y récord público", () => {
  it("guarda y normaliza recordPrivacy y bankrollStartMxnCentavos en /api/me/preferences", async () => {
    const putRes = await putPreferences(
      prefsPutRequest({
        unitMxn: 200,
        bankrollStartMxn: 4000,
        recordPrivacy: {
          bank: { enabled: true, fields: { curve: false } },
          performance: { fields: { roi: true, extraInvalido: true } },
        },
      }),
    );
    expect(putRes.status).toBe(200);
    const putJson = (await putRes.json()) as {
      ok: boolean;
      preferences: {
        unitMxnCentavos: number;
        bankrollStartMxnCentavos: number | null;
        recordPrivacy: Record<string, { enabled: boolean; fields: Record<string, boolean> }>;
      };
    };
    expect(putJson.preferences.unitMxnCentavos).toBe(20_000);
    expect(putJson.preferences.bankrollStartMxnCentavos).toBe(400_000);
    expect(putJson.preferences.recordPrivacy.bank).toEqual({
      enabled: true,
      fields: { netUnits: true, curve: false },
    });
    expect(putJson.preferences.recordPrivacy.performance!.fields.roi).toBe(true);
    expect("extraInvalido" in putJson.preferences.recordPrivacy.performance!.fields).toBe(false);

    const getRes = await getPreferences(new Request("http://localhost:9990/api/me/preferences"));
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as typeof putJson;
    expect(getJson.preferences.bankrollStartMxnCentavos).toBe(400_000);

    // Permite limpiar la banca inicial con null y rechaza montos fuera de rango.
    const clearRes = await putPreferences(prefsPutRequest({ bankrollStartMxn: null }));
    expect(clearRes.status).toBe(200);
    expect(((await clearRes.json()) as typeof putJson).preferences.bankrollStartMxnCentavos).toBeNull();

    const badRes = await putPreferences(prefsPutRequest({ bankrollStartMxn: -50 }));
    expect(badRes.status).toBe(400);
  });

  it("filtra el récord público por bloque/dato, nunca expone pesos ni picks abiertos, y respeta perfil privado", async () => {
    const t1 = new Date("2026-10-10T16:00:00Z");
    const k1 = new Date("2026-10-10T20:00:00Z");
    const s1 = await sealPick(
      db,
      userId,
      {
        pickId: "mx-1__p1",
        gameId: "mx-1",
        leagueLabel: "Liga MX",
        matchLabel: "América vs Cruz Azul",
        pickLabel: "América gana",
        origin: "Spacetime Suite",
        units: 2,
        userDecimal: 2.0,
        fairDecimal: 1.9,
        kickoffAt: k1,
      },
      t1,
    );
    expect(s1.ok).toBe(true);

    const s2 = await sealPick(
      db,
      userId,
      {
        pickId: "nfl-1__p1",
        gameId: "nfl-1",
        leagueLabel: "NFL",
        matchLabel: "KC vs BUF",
        pickLabel: "KC -2.5",
        origin: "Spacetime Suite",
        units: 1,
        userDecimal: 1.9,
        fairDecimal: 1.85,
        kickoffAt: new Date("2026-11-12T20:00:00Z"),
      },
      new Date("2026-11-12T16:00:00Z"),
    );
    expect(s2.ok).toBe(true);

    const sOpen = await sealPick(
      db,
      userId,
      {
        pickId: "pl-1__p1",
        gameId: "pl-1",
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Chelsea",
        pickLabel: "Más de 2.5 goles",
        origin: "Spacetime Suite",
        units: 1,
        userDecimal: 1.95,
        fairDecimal: 1.88,
        kickoffAt: new Date("2026-11-20T20:00:00Z"),
      },
      new Date("2026-11-12T18:00:00Z"),
    );
    expect(sOpen.ok).toBe(true);

    if (s1.ok && s2.ok) {
      await db
        .update(sealedPicks)
        .set({ status: "won", clvPct: "2.40", settledAt: new Date("2026-10-10T22:00:00Z") })
        .where(eq(sealedPicks.id, s1.id));
      await db
        .update(sealedPicks)
        .set({ status: "lost", clvPct: "1.10", settledAt: new Date("2026-11-12T23:00:00Z") })
        .where(eq(sealedPicks.id, s2.id));
    }

    // Por defecto: saldo y ROI ocultos, picks cerrados visibles, pick abierto oculto.
    const def = await loadPublicRecord("@ana_mx", db);
    expect(def).not.toBeNull();
    expect(def && !def.hidden).toBe(true);
    if (!def || def.hidden) throw new Error("expected public record");
    expect(def.settled).toBe(2);
    expect(def.view.wonLost).toEqual({ won: 1, lost: 1, settled: 2 });
    expect(def.view.netUnits).toBeNull();
    expect(def.view.roiPct).toBeNull();
    expect(def.view.settledPicks).toHaveLength(2);
    expect(def.view.settledPicks!.every((p) => p.status !== "pending")).toBe(true);
    expect(JSON.stringify(def)).not.toContain("bankroll");

    // Activando saldo y ROI con banca inicial de $5,000 MXN y unidad de $250 MXN (= 20u):
    // saldo neto = +2u - 1u = +1u -> ROI = +5 %.
    await putPreferences(
      prefsPutRequest({
        unitMxn: 250,
        bankrollStartMxn: 5000,
        recordPrivacy: {
          bank: { enabled: true, fields: { netUnits: true, curve: true } },
          performance: { enabled: true, fields: { roi: true } },
        },
      }),
    );

    const routeRes = await getPublicRecordRoute(
      new Request("http://localhost:9990/api/u/ana_mx/record"),
      { params: Promise.resolve({ handle: "ana_mx" }) },
    );
    expect(routeRes.status).toBe(200);
    const routeBody = (await routeRes.json()) as Awaited<ReturnType<typeof loadPublicRecord>>;
    if (!routeBody || routeBody.hidden) throw new Error("expected visible record");
    expect(routeBody.view.netUnits).toBe(1);
    expect(routeBody.view.roiPct).toBeCloseTo(5, 5);
    expect(JSON.stringify(routeBody)).not.toContain("5000");
    expect(JSON.stringify(routeBody)).not.toContain("500000");

    // Si apaga el perfil público, entrega { hidden: true }.
    await putPreferences(prefsPutRequest({ publicRecordVisible: false }));
    expect(await loadPublicRecord("ana_mx", db)).toEqual({ hidden: true });

    // Usuario inexistente responde 404.
    const missing = await getPublicRecordRoute(
      new Request("http://localhost:9990/api/u/no_existe/record"),
      { params: Promise.resolve({ handle: "no_existe" }) },
    );
    expect(missing.status).toBe(404);
  });
});
