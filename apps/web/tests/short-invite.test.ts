import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  grantDays,
  referralGrants,
  subscriptions,
  users,
  type Db,
} from "@pitchlab/db";
import { middleware } from "../middleware";
import { loadMemberPlanSummary } from "../src/server/member-plan";
import {
  buildInviteShareMetadata,
  resolveOgDisplayHandle,
  resolveShortInviteTarget,
} from "../src/server/short-invite";

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  return drizzle(client) as unknown as Db;
}

describe("enlace corto /i/[code] y metadatos OG", () => {
  it("valida códigos en mayúsculas y minúsculas sin cuentas (omite from)", async () => {
    const upper = await resolveShortInviteTarget("JAIR-2611", {
      accountsEnabled: false,
    });
    expect(upper).toEqual({
      valid: true,
      code: "JAIR-2611",
      handle: null,
      redirectTo: "/pricing/referral?code=JAIR-2611",
    });

    const lower = await resolveShortInviteTarget("  jair-2611  ", {
      accountsEnabled: false,
    });
    expect(lower).toEqual({
      valid: true,
      code: "JAIR-2611",
      handle: null,
      redirectTo: "/pricing/referral?code=JAIR-2611",
    });
  });

  it("redirige códigos inválidos a /pricing sin parámetros", async () => {
    for (const bad of ["", "abc", "bad!code", "A".repeat(25), "con espacio"]) {
      const res = await resolveShortInviteTarget(bad, {
        accountsEnabled: false,
      });
      expect(res).toEqual({
        valid: false,
        code: null,
        handle: null,
        redirectTo: "/pricing",
      });
    }
  });

  it("con cuentas resuelve @usuario por users.referralCode sin escribir en la base", async () => {
    const db = await freshDb();
    await db.insert(users).values({
      email: "carlos@pitchlab.mx",
      handle: "carlos_mx",
      referralCode: "CARLOS-9012",
    });

    const usersBefore = await db.select().from(users);
    const grantsBefore = await db.select().from(referralGrants);

    const match = await resolveShortInviteTarget("carlos-9012", {
      accountsEnabled: true,
      db,
    });
    expect(match).toEqual({
      valid: true,
      code: "CARLOS-9012",
      handle: "carlos_mx",
      redirectTo: "/pricing/referral?code=CARLOS-9012&from=carlos_mx",
    });

    const unknown = await resolveShortInviteTarget("OTRO-4455", {
      accountsEnabled: true,
      db,
    });
    expect(unknown).toEqual({
      valid: true,
      code: "OTRO-4455",
      handle: null,
      redirectTo: "/pricing/referral?code=OTRO-4455",
    });

    const usersAfter = await db.select().from(users);
    const grantsAfter = await db.select().from(referralGrants);
    expect(usersAfter).toHaveLength(usersBefore.length);
    expect(grantsAfter).toHaveLength(grantsBefore.length);
  });

  it("genera metadatos con twitter:card summary_large_image y robots noindex", () => {
    const handle = resolveOgDisplayHandle({
      code: "JAIR-2611",
      dbHandle: null,
      accountsEnabled: false,
    });
    expect(handle).toBe("jair");

    const meta = buildInviteShareMetadata({
      code: "JAIR-2611",
      handle,
    });
    expect(meta.title).toContain("@jair te invita a PitchLab");
    expect(meta.description).toContain("$209 MXN");
    expect((meta.twitter as { card?: string } | undefined)?.card).toBe(
      "summary_large_image",
    );
    expect((meta.robots as { index?: boolean } | undefined)?.index).toBe(false);
  });

  it("middleware permite /i/* sin sesión y aplica X-Robots-Tag noindex", async () => {
    const req = new NextRequest("http://localhost:3000/i/JAIR-2611");
    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("loadMemberPlanSummary lee accessUntil, hasActivePaseTotal y suscripción sin escribir en la base", async () => {
    const db = await freshDb();
    const now = new Date("2026-11-12T12:00:00Z");
    const [member] = await db
      .insert(users)
      .values({
        email: "plan@pitchlab.mx",
        handle: "plan_socio",
        referralCode: "PLAN-1234",
      })
      .returning();

    await grantDays(db, {
      userId: member!.id,
      sourceKind: "trial_m1_nocard",
      days: 7,
      idempotencyKey: `trial:${member!.id}`,
      now,
    });

    const trialSummary = await loadMemberPlanSummary(db, member!.id, now, false);
    expect(trialSummary.active).toBe(true);
    expect(trialSummary.planState).toBe("prueba");
    expect(trialSummary.trialDaysRemaining).toBe(7);
    expect(trialSummary.stripeConfigured).toBe(false);

    await db.insert(subscriptions).values({
      userId: member!.id,
      provider: "stripe",
      providerCustomerId: "cus_test_1",
      providerSubscriptionId: "sub_test_1",
      planInterval: "annual",
      status: "active",
      priceCentavosMxn: 239000,
      currentPeriodStart: now,
      currentPeriodEnd: new Date("2027-11-12T12:00:00Z"),
      cancelAtPeriodEnd: false,
    });

    const annualSummary = await loadMemberPlanSummary(db, member!.id, now, true);
    expect(annualSummary.active).toBe(true);
    expect(annualSummary.planState).toBe("anual");
    expect(annualSummary.interval).toBe("annual");
    expect(annualSummary.hasCard).toBe(true);
    expect(annualSummary.stripeConfigured).toBe(true);
  });
});
