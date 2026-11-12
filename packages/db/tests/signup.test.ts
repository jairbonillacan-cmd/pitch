import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  ageFromIsoDate,
  applyMigrations,
  completeSignup,
  referralGrants,
  signupCompleted,
  users,
  type CompleteSignupInput,
} from "../src/index";

let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-12T12:00:00Z");
const DAY = 86_400_000;

async function user(email: string, referralCode?: string) {
  const [u] = await db.insert(users).values({ email, referralCode }).returning();
  return u!;
}

const trial = (canonicalEmail: string): CompleteSignupInput["trial"] => ({
  canonicalEmail,
  provider: "email",
  deviceFpHash: "d".repeat(64),
  ipSubnetHash: "i".repeat(64),
});

const base = (userId: string, extra: Partial<CompleteSignupInput> = {}): CompleteSignupInput => ({
  userId,
  birthDate: "1990-05-20",
  termsVersion: "2026-11-11",
  analyticsConsent: true,
  marketingConsent: false,
  trial: null,
  now,
  ...extra,
});

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

describe("edad", () => {
  it("cuenta años cumplidos y rechaza fechas que no existen", () => {
    expect(ageFromIsoDate("2008-11-12", now)).toBe(18);
    expect(ageFromIsoDate("2008-11-13", now)).toBe(17);
    expect(ageFromIsoDate("2001-02-30", now)).toBeNull();
    expect(ageFromIsoDate("20-1-1", now)).toBeNull();
  });
});

describe("registro paso 2", () => {
  it("guarda fecha y consentimientos y no acepta menores", async () => {
    const u = await user("a@example.com");
    expect(await completeSignup(db, base(u.id, { birthDate: "2008-11-13" }))).toEqual({
      ok: false,
      reason: "menor_de_edad",
    });
    expect(await signupCompleted(db, u.id)).toBe(false);

    const r = await completeSignup(db, base(u.id));
    expect(r).toEqual({ ok: true, trial: "apagada", referral: "ninguno" });
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row!.birthDate).toBe("1990-05-20");
    expect(row!.isAdult).toBe(true);
    expect(row!.termsVersion).toBe("2026-11-11");
    expect(row!.analyticsConsent).toBe(true);
    expect(await signupCompleted(db, u.id)).toBe(true);

    // La fecha ya registrada no se reescribe.
    await completeSignup(db, base(u.id, { birthDate: "1980-01-01" }));
    const [again] = await db.select().from(users).where(eq(users.id, u.id));
    expect(again!.birthDate).toBe("1990-05-20");
  });

  it("da 7 días una sola vez por correo canónico", async () => {
    const a = await user("ana@gmail.com");
    const b = await user("a.n.a+2@gmail.com");
    expect((await completeSignup(db, base(a.id, { trial: trial("ana@gmail.com") }))).ok).toBe(true);
    expect((await accessUntil(db, a.id, now))!.getTime()).toBe(now.getTime() + 7 * DAY);

    // Repetir no duplica días.
    await completeSignup(db, base(a.id, { trial: trial("ana@gmail.com") }));
    expect((await accessUntil(db, a.id, now))!.getTime()).toBe(now.getTime() + 7 * DAY);

    const rb = await completeSignup(db, base(b.id, { trial: trial("ana@gmail.com") }));
    expect(rb).toMatchObject({ ok: true, trial: "ya_usada" });
    expect(await accessUntil(db, b.id, now)).toBeNull();
  });

  it("registra al anfitrión del código, nunca a uno mismo", async () => {
    const host = await user("host@example.com", "SOCIO-AB12CD");
    const friend = await user("friend@example.com", "SOCIO-FF0000");
    expect(await completeSignup(db, base(host.id, { referralCode: "socio-ab12cd" }))).toMatchObject({
      referral: "ninguno",
    });
    expect(await completeSignup(db, base(friend.id, { referralCode: "socio-ab12cd" }))).toMatchObject({
      referral: "registrado",
    });
    const rows = await db.select().from(referralGrants);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ referrerUserId: host.id, referredUserId: friend.id, status: "trial_started" });
    expect(await completeSignup(db, base(friend.id, { referralCode: "SOCIO-AB12CD" }))).toMatchObject({
      referral: "ninguno",
    });
  });
});
