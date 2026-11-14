import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  ageFromIsoDate,
  applyMigrations,
  checkHandleFormat,
  completeSignup,
  entitlementGrants,
  memberProfile,
  publicProfileByHandle,
  setMemberAvatarUrl,
  updateMemberProfile,
  buildHandleCandidates,
  suggestHandle,
  suggestHandles,
  tipsterAttributions,
  tipsterProfiles,
  referralGrants,
  signupCompleted,
  users,
  type CompleteSignupInput,
} from "../src/index";

let client: PGlite;
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
  displayName: "Ana López",
  handle: `socio${userId.replace(/[^a-z0-9]/g, "").slice(0, 12)}`,
  birthDate: "1990-05-20",
  termsVersion: "2026-11-11",
  analyticsConsent: true,
  marketingConsent: false,
  trial: null,
  now,
  ...extra,
});

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
}, 60_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users CASCADE");
});

afterAll(async () => {
  await client?.close();
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


  it("dos pestañas conservan un solo registro y una prueba de siete días", async () => {
    const account = await user("dos.pestanas@example.com");
    const input = base(account.id, { trial: trial(account.email) });
    const results = await Promise.all([
      completeSignup(db, input),
      completeSignup(db, input),
    ]);
    expect(results).toEqual([
      { ok: true, trial: "concedida", referral: "ninguno" },
      { ok: true, trial: "concedida", referral: "ninguno" },
    ]);
    const grants = await db.select().from(entitlementGrants).where(eq(entitlementGrants.userId, account.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.daysGranted).toBe(7);
    await updateMemberProfile(db, account.id, { displayName: "Nombre editado" });
    await completeSignup(db, input);
    expect((await memberProfile(db, account.id))?.displayName).toBe("Nombre editado");
  });

  it("un código de tipster activo deja la atribución para su comisión (P0-05)", async () => {
    const tipster = await user("tipster@example.com", "SOCIO-TT0001");
    await db.insert(tipsterProfiles).values({
      userId: tipster.id,
      handle: "sofia_nfl",
      displayName: "Sofía",
      specialty: "NFL",
      promoCode: "SOFIA5",
      defaultWeeklySlug: "sofia-sem",
    });
    const friend = await user("fan@example.com", "SOCIO-FA0001");
    expect(await completeSignup(db, base(friend.id, { referralCode: "sofia5" }))).toMatchObject({ referral: "registrado" });
    const rows = await db.select().from(tipsterAttributions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tipsterUserId: tipster.id, referredUserId: friend.id, promoCodeUsed: "SOFIA5", status: "trial_5d" });
    // El tipster no se atribuye a sí mismo.
    expect(await completeSignup(db, base(tipster.id, { referralCode: "SOFIA5" }))).toMatchObject({ referral: "ninguno" });
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

describe("usuario (@handle)", () => {
  it("valida formato y reservados", () => {
    expect(checkHandleFormat("@Ana_Lopez")).toEqual({ ok: true, handle: "ana_lopez" });
    expect(checkHandleFormat("ab")).toEqual({ ok: false, reason: "formato" });
    expect(checkHandleFormat("1ana")).toEqual({ ok: false, reason: "formato" });
    expect(checkHandleFormat("ana.lopez")).toEqual({ ok: false, reason: "formato" });
    expect(checkHandleFormat("sofia_nfl")).toEqual({ ok: false, reason: "reservado" });
  });

  it("guarda nombre y usuario, y no deja repetirlo", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    expect((await completeSignup(db, base(a.id, { handle: "Ana_Lopez", displayName: "  Ana   López " }))).ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, a.id));
    expect(row).toMatchObject({ handle: "ana_lopez", displayName: "Ana López" });
    expect(await completeSignup(db, base(b.id, { handle: "ana_lopez" }))).toEqual({
      ok: false,
      reason: "usuario_ocupado",
    });
    expect(await signupCompleted(db, b.id)).toBe(false);
    // El propio se puede volver a mandar.
    expect((await completeSignup(db, base(a.id, { handle: "ana_lopez" }))).ok).toBe(true);
    expect(await completeSignup(db, base(b.id, { displayName: "x" }))).toEqual({ ok: false, reason: "nombre_invalido" });
  });

  it("sugiere un usuario libre sin acentos", async () => {
    expect(await suggestHandle(db, "José Pérez")).toBe("jose_perez");
    const u = await user("c@example.com");
    await completeSignup(db, base(u.id, { handle: "jose_perez" }));
    expect(await suggestHandle(db, "José Pérez")).toBe("jose_perez2");
    expect(await suggestHandle(db, "42@example.com")).toMatch(/^socio/);
  });

  it("suggestHandles genera 3 sugerencias únicas, variadas y disponibles", async () => {
    const firstBatch = await suggestHandles(db, ["José Pérez", "jose.perez@example.com"], 3);
    expect(firstBatch).toHaveLength(3);
    expect(new Set(firstBatch).size).toBe(3);
    expect(firstBatch).toEqual(["jose_perez", "jose", "j_perez"]);
    for (const h of firstBatch) {
      expect(checkHandleFormat(h).ok).toBe(true);
    }

    // Al tomar los primeros usuarios ya ocupados, salta a variantes compactas y sufijos numéricos.
    const u1 = await user("u1@example.com");
    const u2 = await user("u2@example.com");
    const u3 = await user("u3@example.com");
    await completeSignup(db, base(u1.id, { handle: "jose_perez" }));
    await completeSignup(db, base(u2.id, { handle: "jose" }));
    await completeSignup(db, base(u3.id, { handle: "j_perez" }));

    const nextBatch = await suggestHandles(db, ["José Pérez"], 3);
    expect(nextBatch).toHaveLength(3);
    expect(new Set(nextBatch).size).toBe(3);
    for (const taken of firstBatch) {
      expect(nextBatch).not.toContain(taken);
    }
    expect(nextBatch[0]).toBe("joseperez");

    // También evita reservados aunque coincidan con la base y excluye exceptUserId cuando se solicita.
    const reservedFiltered = await suggestHandles(db, ["admin", "soporte"], 3);
    expect(reservedFiltered).toHaveLength(3);
    for (const h of reservedFiltered) {
      expect(checkHandleFormat(h).ok).toBe(true);
      expect(h).not.toBe("admin");
      expect(h).not.toBe("soporte");
    }

    const ownException = await suggestHandles(db, ["José Pérez"], 3, { exceptUserId: u1.id });
    expect(ownException[0]).toBe("jose_perez");

    // Entradas numéricas o vacías caen en prefijos socio válidos y nunca repiten dominios del correo.
    expect(await suggestHandles(db, ["42+promo@secretdomain.mx"], 3)).toEqual([
      "socio42",
      "socio422",
      "socio423",
    ]);
    expect(await suggestHandles(db, [""], 3)).toEqual(["socio", "socio2", "socio3"]);
    expect(buildHandleCandidates(["Ana María López"])).not.toContain("root");
    expect(await suggestHandles(db, ["José"], 0)).toEqual([]);
  });
});

describe("perfiles de socio", () => {
  it("conserva el propio usuario, rechaza el de otro socio y deja de resolver el anterior", async () => {
    const [a, b] = await db.insert(users).values([
      { authUserId: "auth-ana", email: "ana.perfil@example.com", handle: "ana_perfil", displayName: "Ana", isAdult: true },
      { authUserId: "auth-luis", email: "luis.perfil@example.com", handle: "luis_perfil", displayName: "Luis", isAdult: true },
    ]).returning();
    expect(await updateMemberProfile(db, a!.id, { handle: a!.handle!, bio: "Liga MX" })).toMatchObject({ status: "saved" });
    expect(await updateMemberProfile(db, a!.id, { handle: b!.handle! })).toEqual({ status: "taken" });
    expect(await updateMemberProfile(db, a!.id, { handle: "ana_analisis" })).toMatchObject({ status: "saved" });
    expect(await publicProfileByHandle(db, "ana_perfil")).toBeNull();
    expect(await publicProfileByHandle(db, "ana_analisis")).toEqual({
      handle: "ana_analisis",
      displayName: "Ana",
      bio: "Liga MX",
      avatarUrl: null,
      xUsername: null,
      joinedAt: a!.createdAt,
      isTipster: false,
    });

    expect(
      await setMemberAvatarUrl(db, a!.id, "https://ejemplo.blob.vercel-storage.com/avatars/ana-1.webp"),
    ).toEqual({
      status: "saved",
      previousAvatarUrl: null,
      avatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/ana-1.webp",
    });
    expect(
      await setMemberAvatarUrl(db, a!.id, "https://ejemplo.blob.vercel-storage.com/avatars/ana-2.webp"),
    ).toEqual({
      status: "saved",
      previousAvatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/ana-1.webp",
      avatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/ana-2.webp",
    });
    expect((await publicProfileByHandle(db, "ana_analisis"))?.avatarUrl).toBe(
      "https://ejemplo.blob.vercel-storage.com/avatars/ana-2.webp",
    );
    expect(await setMemberAvatarUrl(db, a!.id, null)).toEqual({
      status: "saved",
      previousAvatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/ana-2.webp",
      avatarUrl: null,
    });
  });
});
