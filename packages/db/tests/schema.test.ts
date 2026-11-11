import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  entitlementGrants,
  publicWeeklyPicks,
  referralGrants,
  sealedPicks,
  tipstarCommissionLedger,
  tipstarAttributions,
  tipstarProfiles,
  users,
  watchlist,
} from "../src/index.js";

let client: PGlite;
let db: ReturnType<typeof drizzle>;

async function newUser(email: string) {
  const [u] = await db.insert(users).values({ email }).returning();
  return u!;
}

beforeEach(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

const kickoff = new Date("2026-11-21T20:00:00Z");

describe("esquema PitchLab (Postgres)", () => {
  it("aplica la migración completa", async () => {
    const res = await client.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(res.rows[0]!.n).toBe(23);
  });

  it("bitácora: sella antes del inicio y no repite el mismo pick", async () => {
    const u = await newUser("socio@example.com");
    const base = {
      userId: u.id,
      pickId: "pl-1__p1",
      gameId: "pl-1",
      leagueLabel: "Premier League",
      matchLabel: "Chelsea vs Leeds",
      pickLabel: "Chelsea gana",
      origin: "Spacetime Suite",
      units: "1.50",
      userDecimal: "1.820",
      fairDecimal: "1.850",
      sealHash: "a".repeat(64),
      sealedAt: new Date("2026-11-20T10:00:00Z"),
      kickoffAt: kickoff,
    };
    await db.insert(sealedPicks).values(base);
    await expect(db.insert(sealedPicks).values(base)).rejects.toThrow();
    await expect(
      db.insert(sealedPicks).values({ ...base, pickId: "pl-1__p2", sealedAt: new Date("2026-11-21T21:00:00Z") }),
    ).rejects.toThrow();
    await expect(db.insert(sealedPicks).values({ ...base, pickId: "pl-1__p3", units: "9.00" })).rejects.toThrow();
  });

  it("vigilancia: un partido por usuario y se borra con el usuario", async () => {
    const u = await newUser("v@example.com");
    await db.insert(watchlist).values({ userId: u.id, gameId: "g1" });
    await expect(db.insert(watchlist).values({ userId: u.id, gameId: "g1" })).rejects.toThrow();
    await db.delete(users).where(eq(users.id, u.id));
    expect(await db.select().from(watchlist)).toHaveLength(0);
  });

  it("referidos: nadie se refiere a sí mismo y cada quien es referido una vez", async () => {
    const a = await newUser("a@example.com");
    const b = await newUser("b@example.com");
    const c = await newUser("c@example.com");
    await expect(
      db.insert(referralGrants).values({ referrerUserId: a.id, referredUserId: a.id, referralCodeUsed: "SOCIO-1", status: "trial_started" }),
    ).rejects.toThrow();
    await db.insert(referralGrants).values({ referrerUserId: a.id, referredUserId: b.id, referralCodeUsed: "SOCIO-1", status: "trial_started" });
    await expect(
      db.insert(referralGrants).values({ referrerUserId: c.id, referredUserId: b.id, referralCodeUsed: "SOCIO-2", status: "trial_started" }),
    ).rejects.toThrow();
  });

  it("días gratis: idempotentes por clave", async () => {
    const u = await newUser("g@example.com");
    const grant = {
      userId: u.id,
      sourceKind: "referral_host_15d",
      daysGranted: 15,
      startsAt: new Date("2026-11-11T00:00:00Z"),
      endsAt: new Date("2026-11-26T00:00:00Z"),
      idempotencyKey: "ref_host_15d:abc",
    };
    await db.insert(entitlementGrants).values(grant);
    await expect(db.insert(entitlementGrants).values(grant)).rejects.toThrow();
  });

  it("tipstars: un pick abierto por semana y comisión cuadrada con el neto", async () => {
    const t = await newUser("t@example.com");
    const fan = await newUser("fan@example.com");
    await db.insert(tipstarProfiles).values({
      userId: t.id,
      handle: "tipstar_real",
      displayName: "Tipstar",
      specialty: "NFL",
      promoCode: "REAL5",
      defaultWeeklySlug: "real-sem",
    });
    const week = {
      tipstarUserId: t.id,
      isoYearWeek: "2026-W47",
      publicSlug: "real-sem",
      originType: "spacetime",
      gameId: "nfl-1",
      unlockedPickId: "nfl-1__p1",
      thesisCopy: "Lectura",
      publishedAt: new Date("2026-11-18T00:00:00Z"),
      gameKickoffAt: kickoff,
    };
    await db.insert(publicWeeklyPicks).values(week);
    await expect(db.insert(publicWeeklyPicks).values({ ...week, gameId: "nfl-2" })).rejects.toThrow();

    const [attr] = await db
      .insert(tipstarAttributions)
      .values({ tipstarUserId: t.id, referredUserId: fan.id, promoCodeUsed: "REAL5", status: "active_paying" })
      .returning();
    const row = {
      attributionId: attr!.id,
      tipstarUserId: t.id,
      stripeInvoiceId: "in_1",
      grossPaidCentavosMxn: 29900,
      vatCentavosMxn: 4124,
      gatewayFeeCentavosMxn: 1500,
      netCommissionableCentavosMxn: 24276,
      commissionBps: 2500,
      commissionCentavosMxn: 6069,
      status: "pending_clearance",
      clearsAt: new Date("2026-12-01T00:00:00Z"),
    };
    await db.insert(tipstarCommissionLedger).values(row);
    await expect(
      db.insert(tipstarCommissionLedger).values({ ...row, stripeInvoiceId: "in_2", netCommissionableCentavosMxn: 99999 }),
    ).rejects.toThrow();
  });
});
