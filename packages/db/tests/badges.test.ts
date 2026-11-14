import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createSocialPost,
  getUserPreferences,
  loadBadgeFacts,
  referralGrants,
  sealedPicks,
  setSocialLike,
  upsertUserPreferences,
  users,
  type Db,
} from "../src/index";

let client: PGlite;
let db: Db;
const now = new Date("2026-11-12T12:00:00Z");

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
}, 60_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users CASCADE");
});

afterAll(async () => {
  await client.close();
});

describe("loadBadgeFacts", () => {
  it("junta picks, «me gusta» en posts con pick y referidos con pago, por id o por usuario", async () => {
    const ana = await member("ana_mx");
    const leo = await member("leo_mx");
    await db.insert(sealedPicks).values({
      userId: ana.id,
      pickId: "p1",
      gameId: "g1",
      leagueLabel: "Liga MX",
      matchLabel: "A vs B",
      pickLabel: "Local",
      origin: "Spacetime Suite",
      units: "1",
      userDecimal: "2",
      fairDecimal: "1.9",
      clvPct: "2",
      status: "won",
      sealHash: "h".repeat(64),
      sealedAt: new Date("2026-11-01T10:00:00Z"),
      kickoffAt: new Date("2026-11-01T18:00:00Z"),
    });
    const pick = { pickId: "p1", gameId: "g1", label: "Local", units: 1, userDecimal: 2, fairDecimal: 1.9, modelProbability: 0.55 };
    const withPick = await createSocialPost(
      db,
      ana.id,
      { body: "Local con ventaja clara hoy.", leagueLabel: "Liga MX", matchLabel: "A vs B", pickBadge: "Local", originType: "Spacetime Suite", pick },
      now,
    );
    const noPick = await createSocialPost(
      db,
      ana.id,
      { body: "Opinión sin pick adjunto.", leagueLabel: "Comunidad", matchLabel: "", pickBadge: "", originType: "Bitácora Propia" },
      new Date(now.getTime() + 60_000),
    );
    if (!withPick.ok || !noPick.ok) throw new Error("no se creó la publicación");
    await setSocialLike(db, leo.id, withPick.id, true, now);
    await setSocialLike(db, leo.id, noPick.id, true, now);
    await db.insert(referralGrants).values([
      { referrerUserId: ana.id, referredUserId: leo.id, referralCodeUsed: "ANA", status: "rewarded_bilateral" },
    ]);

    const byId = await loadBadgeFacts(db, { userIds: [ana.id] });
    const facts = byId.get(ana.id)!;
    expect(facts).toMatchObject({ handle: "ana_mx", likesOnPickPosts: 1, paidReferrals: 1, isTipster: false });
    expect(facts.picks).toHaveLength(1);
    expect(facts.picks[0]).toMatchObject({ status: "won", userDecimal: 2, clvPct: 2 });

    const byHandle = await loadBadgeFacts(db, { handles: ["ANA_MX", "leo_mx"] });
    expect([...byHandle.values()].map((f) => f.handle).sort()).toEqual(["ana_mx", "leo_mx"]);
    expect(byHandle.get(leo.id)).toMatchObject({ likesOnPickPosts: 0, paidReferrals: 0, picks: [] });
  });

  it("guarda hasta 3 destacadas sin repetir", async () => {
    const ana = await member("ana_mx");
    await upsertUserPreferences(db, ana.id, { featuredBadges: ["a", "b", "a", "c", "d"] }, now);
    expect((await getUserPreferences(db, ana.id)).featuredBadges).toEqual(["a", "b", "c"]);
    await expect(
      client.exec(`UPDATE user_preferences SET featured_badges = ARRAY['a','b','c','d']`),
    ).rejects.toThrow();
  });
});
