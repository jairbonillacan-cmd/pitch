import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, eq, sealedPicks, users, type Db } from "@pitchlab/db";
import { GET as getBadges } from "../app/api/me/badges/route";
import { PUT as putPreferences } from "../app/api/me/preferences/route";
import { loadProfileBadges, withAuthorBadges } from "../src/server/badges";

const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), serverDb: vi.fn() }));

vi.mock("../src/server/session-user", () => ({
  requireMember: mocks.requireMember,
  serverDb: mocks.serverDb,
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
    .values({ email: "ana@example.com", authUserId: "auth_ana", handle: "ana_mx", displayName: "Ana", isAdult: true })
    .returning();
  userId = u!.id;
  // 5 picks ganados seguidos: «Racha 5» (sale del dato «Rachas» de Mi récord).
  const base = Date.parse("2026-11-01T10:00:00Z");
  await db.insert(sealedPicks).values(
    Array.from({ length: 5 }, (_, i) => ({
      userId,
      pickId: `p${i}`,
      gameId: `g${i}`,
      leagueLabel: "Liga MX",
      matchLabel: "A vs B",
      pickLabel: "Local",
      origin: "Spacetime Suite",
      units: "1",
      userDecimal: "1.9",
      fairDecimal: "1.85",
      clvPct: "1",
      status: "won",
      sealHash: "h".repeat(64),
      sealedAt: new Date(base + i * 86_400_000),
      kickoffAt: new Date(base + i * 86_400_000 + 3_600_000),
      settledAt: new Date(base + i * 86_400_000 + 3 * 3_600_000),
    })),
  );
  mocks.requireMember.mockResolvedValue({ db, userId });
  mocks.serverDb.mockReturnValue(db);
});

afterEach(() => {
  vi.resetAllMocks();
});

const put = (body: unknown) =>
  putPreferences(
    new Request("http://localhost:9990/api/me/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: "http://localhost:9990" },
    }),
  );

describe("Insignias", () => {
  it("GET /api/me/badges trae todas con avance y marca las públicas", async () => {
    const res = await getBadges(new Request("http://localhost:9990/api/me/badges"));
    const json = (await res.json()) as {
      badges: Array<{ id: string; earned: boolean; progress: { current: number } | null }>;
      publicIds: string[];
      featuredIds: string[];
    };
    expect(json.badges.find((b) => b.id === "racha-5")?.earned).toBe(true);
    expect(json.badges.find((b) => b.id === "ojo-fino")).toMatchObject({ earned: false, progress: { current: 5 } });
    expect(json.publicIds).toContain("racha-5");
    expect(json.featuredIds).toEqual([]);
  });

  it("solo deja destacar insignias ganadas y públicas", async () => {
    expect((await put({ featuredBadges: ["ojo-fino"] })).status).toBe(400);
    expect((await put({ featuredBadges: ["a", "b", "c", "d"] })).status).toBe(400);
    const ok = await put({ featuredBadges: ["racha-5", "fundador-beta"] });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { preferences: { featuredBadges: string[] } }).preferences.featuredBadges).toEqual([
      "racha-5",
      "fundador-beta",
    ]);
    expect((await loadProfileBadges("ana_mx"))?.featured.map((b) => b.id)).toEqual(["racha-5", "fundador-beta"]);
  });

  it("al ocultar las rachas, «Racha 5» sale del perfil y de las destacadas", async () => {
    await put({ featuredBadges: ["racha-5"] });
    await put({ recordPrivacy: { record: { fields: { streaks: false } } } });
    const profile = await loadProfileBadges("ana_mx");
    expect(profile?.public.map((b) => b.id)).not.toContain("racha-5");
    expect(profile?.featured).toEqual([]);
  });

  it("perfil privado: ninguna insignia; el feed lleva la primera destacada del autor", async () => {
    await put({ featuredBadges: ["racha-5"] });
    const [post] = await withAuthorBadges(db, [{ authorHandle: "ana_mx" }]);
    expect(post?.authorBadge).toMatchObject({ id: "racha-5", label: "Racha 5" });

    await db.update(users).set({ publicProfile: false }).where(eq(users.id, userId));
    expect(await loadProfileBadges("ana_mx")).toEqual({ public: [], featured: [] });
    const [hidden] = await withAuthorBadges(db, [{ authorHandle: "ana_mx" }]);
    expect(hidden?.authorBadge).toBeNull();
  });
});
