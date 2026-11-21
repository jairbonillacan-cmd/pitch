import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextResponse } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, castMatchVote, sealedPicks, upsertUserPreferences, users, type Db } from "@pitchlab/db";
import type { PlatformGame } from "@pitchlab/ui/types";
import { GET as getConsensus } from "../app/api/social/consensus/route";
import { GET as getRanking } from "../app/api/social/ranking/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import { buildServerRawPlatformDataset } from "../src/server/platform-data";
import { loadCommunityBadgeExtras, resetRankingCacheForTests } from "../src/server/ranking";
import { resetRateLimitsForTests } from "../src/server/request-security";

const mocks = vi.hoisted(() => ({ requireSocialMember: vi.fn() }));
vi.mock("../src/server/social", () => ({ requireSocialMember: mocks.requireSocialMember }));

let client: PGlite;
let db: Db;
let anaId: string;
const DAY = 86_400_000;

async function member(handle: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${handle}@example.com`, authUserId: `auth_${handle}`, handle, displayName: handle, isAdult: true })
    .returning();
  return u!.id;
}

async function sealWon(userId: string, n: number, daysAgo: number) {
  const base = Date.now() - daysAgo * DAY;
  await db.insert(sealedPicks).values(
    Array.from({ length: n }, (_, i) => ({
      userId,
      pickId: `p-${daysAgo}-${i}`,
      gameId: `g${i}`,
      leagueLabel: "Liga MX",
      matchLabel: "A vs B",
      pickLabel: "Local",
      origin: "Spacetime Suite",
      units: "1",
      userDecimal: "2",
      fairDecimal: "1.9",
      clvPct: "1",
      status: "won",
      sealHash: "h".repeat(64),
      sealedAt: new Date(base - i * 3_600_000),
      kickoffAt: new Date(base - i * 3_600_000 + 3_600_000),
    })),
  );
}

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  await client.exec("SET pitchlab.allow_historical_seed = 'on'");
  db = drizzle(client) as unknown as Db;
});

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users, match_results, security_rate_buckets, security_abuse_events CASCADE;");
  resetRankingCacheForTests();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
  anaId = await member("ana_mx");
  mocks.requireSocialMember.mockResolvedValue({
    db,
    userId: anaId,
    email: "ana_mx@example.com",
    emailVerified: true,
    authUserId: "auth_ana_mx",
  });
});

afterEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

describe("GET /api/social/ranking", () => {
  it("manda solo cifras agregadas de quienes aceptaron aparecer con watermark y cabeceras privadas", async () => {
    const leo = await member("leo_mx");
    await sealWon(anaId, 6, 2);
    await sealWon(leo, 6, 2);
    await upsertUserPreferences(db, leo, { showInRanking: false }, new Date());

    const res = await getRanking(new Request("http://localhost/api/social/ranking"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-pitchlab-trace")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const json = (await res.json()) as {
      rows: Array<{ handle: string; windows: Record<string, { settled: number; netUnits: number }> }>;
      minSettled: Record<string, number>;
    };
    expect(json.rows.map((r) => r.handle)).toEqual(["ana_mx"]);
    expect(json.rows[0]!.windows["7d"]).toMatchObject({ settled: 6, netUnits: 6 });
    expect(json.minSettled).toEqual({ "7d": 5, "30d": 15 });
    expect(JSON.stringify(json)).not.toMatch(/pickLabel|email|userId/);
  });

  it("rechaza acceso sin membresía social activa", async () => {
    mocks.requireSocialMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "La comunidad es para socios con Pase vigente." }, { status: 403 }),
    });
    const res = await getRanking(new Request("http://localhost/api/social/ranking"));
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET /api/social/consensus", () => {
  it("cuenta los votos de «¿Quién gana?» de partidos por jugar con watermark", async () => {
    const upcoming = buildServerRawPlatformDataset().games.find((g) => g.status === "NS");
    if (!upcoming) return;
    await castMatchVote(db, anaId, { gameId: upcoming.id, question: "ganador", choice: "home" }, new Date());
    const res = await getConsensus(new Request("http://localhost/api/social/consensus"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-pitchlab-trace")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const json = (await res.json()) as { tallies: Array<{ gameId: string; home: number }> };
    expect(json.tallies).toContainEqual({ gameId: upcoming.id, home: 1, draw: 0, away: 0 });
  });
});

describe("insignias de Comunidad", () => {
  it("guarda el resultado y da «Lectura del partido» a la mayoría que acertó", async () => {
    const others = await Promise.all(["b1", "b2", "b3", "b4"].map((h) => member(h)));
    const voters = [anaId, ...others];
    for (const [i, id] of voters.entries()) {
      await castMatchVote(db, id, { gameId: "fin-1", question: "ganador", choice: i < 4 ? "home" : "away" }, new Date());
    }
    const finished = [{ id: "fin-1", status: "FT", score: { home: 2, away: 0 } }] as unknown as PlatformGame[];
    const extras = await loadCommunityBadgeExtras(db, new Date(), finished);
    expect(extras.pollHits.get(anaId)).toBe(1);
    expect(extras.pollHits.get(others[3]!)).toBeUndefined();

    resetRankingCacheForTests();
    const later = await loadCommunityBadgeExtras(db, new Date(), []);
    expect(later.pollHits.get(anaId)).toBe(1);
  });
});
