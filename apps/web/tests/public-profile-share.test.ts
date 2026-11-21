import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  eq,
  sealedPicks,
  upsertUserPreferences,
  users,
  type Db,
} from "@pitchlab/db";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import { PlatformProvider } from "@pitchlab/ui/platform";
import { PublicAnalystProfileSurface } from "@pitchlab/ui/public-profile";
import { middleware } from "../middleware";
import { loadPublicShareProfile } from "../src/server/public-profile";

let db: Db;
let counter = 0;

beforeAll(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  await client.exec("SET pitchlab.allow_historical_seed = 'on'");
  db = drizzle(client) as unknown as Db;
});

async function seedMember(opts: {
  handle: string;
  displayName: string;
  publicProfile: boolean;
  publicRecordVisible: boolean;
  recordPrivacy?: Record<string, unknown>;
  withSettledPick?: boolean;
}): Promise<string> {
  counter += 1;
  const authUserId = `auth-pub-${counter}-${opts.handle}`;
  const [inserted] = await db
    .insert(users)
    .values({
      authUserId,
      email: `${opts.handle}@example.test`,
      displayName: opts.displayName,
      handle: opts.handle,
      isAdult: true,
      termsAcceptedAt: new Date("2026-11-01T12:00:00Z"),
      publicProfile: opts.publicProfile,
    })
    .returning({ id: users.id });

  const userId = inserted!.id;

  await upsertUserPreferences(db, userId, {
    publicRecordVisible: opts.publicRecordVisible,
    ...(opts.recordPrivacy ? { recordPrivacy: opts.recordPrivacy } : {}),
  });

  await db
    .update(users)
    .set({ publicProfile: opts.publicProfile })
    .where(eq(users.id, userId));

  if (opts.withSettledPick) {
    const sealHash = createHash("sha256")
      .update(`${userId}:game-pub-${counter}:pick-pub-${counter}`)
      .digest("hex");
    await db.insert(sealedPicks).values({
      userId,
      gameId: `game-pub-${counter}`,
      pickId: `pick-pub-${counter}`,
      leagueLabel: "Liga MX",
      matchLabel: "América vs Chivas",
      pickLabel: "América gana",
      origin: "Spacetime Suite",
      units: "2.00",
      userDecimal: "1.900",
      fairDecimal: "1.720",
      clvPct: "2.40",
      status: "won",
      sealHash,
      kickoffAt: new Date("2026-11-10T20:00:00Z"),
      sealedAt: new Date("2026-11-10T18:00:00Z"),
      settledAt: new Date("2026-11-10T22:00:00Z"),
    });
  }

  return userId;
}

describe("Perfil público verificable /u/[handle] fuera del candado /login", () => {
  it("middleware deja pasar /u/[handle] sin sesión pero redirige /app/u/[handle] a /login", async () => {
    const reqPublic = new NextRequest("http://127.0.0.1:3100/u/socioverificado");
    const resPublic = await middleware(reqPublic);
    expect(resPublic.status).toBe(200);
    expect(resPublic.headers.get("location")).toBeNull();

    const reqClub = new NextRequest("http://127.0.0.1:3100/app/u/socioverificado");
    const resClub = await middleware(reqClub);
    expect(resClub.status).toBe(307);
    expect(resClub.headers.get("location")).toContain("/login");
  });

  it("bloquea perfiles inexistentes o con publicProfile apagado devolviendo null (404)", async () => {
    await seedMember({
      handle: "perfilprivado",
      displayName: "Oculto",
      publicProfile: false,
      publicRecordVisible: true,
      withSettledPick: true,
    });

    expect(await loadPublicShareProfile("noexiste999", db)).toBeNull();
    expect(await loadPublicShareProfile("perfilprivado", db)).toBeNull();
  });

  it("oculta por completo métricas y picks cuando publicRecordVisible es false", async () => {
    await seedMember({
      handle: "sociosinrecord",
      displayName: "Ana Sin Récord",
      publicProfile: true,
      publicRecordVisible: false,
      withSettledPick: true,
    });

    const data = await loadPublicShareProfile("sociosinrecord", db);
    expect(data).not.toBeNull();
    expect(data?.profile.handle).toBe("sociosinrecord");
    expect(data?.publicRecord).toEqual({ hidden: true });
  });

  it("aplica recordPrivacy sin filtrar métricas desactivadas ni montos en pesos", async () => {
    await seedMember({
      handle: "analistaclv",
      displayName: "Diego Métricas",
      publicProfile: true,
      publicRecordVisible: true,
      recordPrivacy: {
        record: {
          enabled: true,
          fields: {
            wonLost: true,
            hitRate: true,
            byLeague: false,
            byMarket: false,
            streaks: false,
          },
        },
        performance: {
          enabled: true,
          fields: {
            yield: false,
            roi: false,
            clv: true,
            avgOdds: false,
            months: false,
          },
        },
        bank: { enabled: false, fields: { netUnits: false, curve: false } },
        history: { enabled: true, fields: { settledPicks: false } },
      },
      withSettledPick: true,
    });

    const data = await loadPublicShareProfile("analistaclv", db);
    expect(data).not.toBeNull();
    expect(data?.publicRecord?.hidden).toBe(false);
    if (data?.publicRecord && !data.publicRecord.hidden) {
      expect(data.publicRecord.settled).toBe(1);
      expect(data.publicRecord.view.wonLost).toEqual({ won: 1, lost: 0, settled: 1 });
      expect(data.publicRecord.view.hitRatePct).toBe(100);
      expect(data.publicRecord.view.avgClvPct).toBe(2.4);
      expect(data.publicRecord.view.yieldPct).toBeNull();
      expect(data.publicRecord.view.roiPct).toBeNull();
      expect(data.publicRecord.view.netUnits).toBeNull();
      expect(data.publicRecord.view.settledPicks).toBeNull();
    }

    const html = renderToStaticMarkup(
      React.createElement(PlatformProvider, {
        dataset: buildPlatformDataset([]),
        initialRole: "visitor",
        accountsEnabled: true,
        children: React.createElement(PublicAnalystProfileSurface, {
          profile: data!.profile,
          publicRecord: data!.publicRecord,
          badges: data!.badges,
        }),
      }),
    );
    expect(html).toContain("@analistaclv");
    expect(html).toContain("Diego Métricas");
    expect(html).toContain("100.0 %");
    expect(html).not.toContain("Retorno sobre banca");
  });
});
