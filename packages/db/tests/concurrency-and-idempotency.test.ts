import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessCoupons,
  addSocialComment,
  applyMigrations,
  approveTransferRequest,
  couponRedemptions,
  createAccessCoupon,
  createSocialPost,
  createTransferRequest,
  getUserPreferences,
  listFollowedGames,
  redeemAccessCoupon,
  rejectTransferRequest,
  reportSocialContent,
  sealedPicks,
  setFollowedGame,
  setSocialCommentHelpful,
  setSocialFollow,
  setSocialLike,
  socialFollows,
  socialLikes,
  socialModerationLogs,
  transferPaymentRequests,
  upsertUserPreferences,
  users,
  watchlist,
} from "../src/index";
import {
  countActiveMarketAlertsForUser,
  createMarketAlert,
  listMarketAlertsForUser,
} from "../src/market-alerts";

let pgliteClient: PGlite;
let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-22T12:00:00Z");

async function newMember(email: string, handle: string) {
  const [u] = await db
    .insert(users)
    .values({
      email,
      handle,
      authUserId: `auth-${handle}`,
      displayName: handle,
    })
    .returning();
  return u!;
}

beforeEach(async () => {
  pgliteClient = new PGlite();
  await applyMigrations((sqlText) => pgliteClient.exec(sqlText));
  db = drizzle(pgliteClient);
});

describe("PGlite 0000..0027 · concurrencia e idempotencia", () => {
  it("watchlist: altas y bajas paralelas son idempotentes y sin duplicados", async () => {
    const member = await newMember("watch@example.com", "watch_mx");

    const addResults = await Promise.all(
      Array.from({ length: 6 }, () =>
        setFollowedGame(db, member.id, "ligamx_ame_chi_2026", true, {
          kickoff: true,
          goals: true,
          final: true,
        }),
      ),
    );
    expect(addResults.every((r) => r.ok)).toBe(true);

    const rowsAfterAdd = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.userId, member.id), eq(watchlist.gameId, "ligamx_ame_chi_2026")));
    expect(rowsAfterAdd).toHaveLength(1);
    expect((await listFollowedGames(db, member.id)).map((g) => g.gameId)).toEqual([
      "ligamx_ame_chi_2026",
    ]);

    const removeResults = await Promise.all(
      Array.from({ length: 4 }, () => setFollowedGame(db, member.id, "ligamx_ame_chi_2026", false)),
    );
    expect(removeResults.every((r) => r.ok)).toBe(true);
    expect(await listFollowedGames(db, member.id)).toHaveLength(0);
  });

  it("sealed_picks: idempotencia en duplicados y trigger inmutable bloquea UPDATE/DELETE", async () => {
    const member = await newMember("seal@example.com", "seal_mx");
    const sealTime = new Date();
    const futureKickoff = new Date(Date.now() + 2 * 3_600_000);
    const pastKickoff = new Date(Date.now() - 3_600_000);

    let retroErrMsg = "";
    try {
      await db.insert(sealedPicks).values({
        userId: member.id,
        pickId: "pick_retro_001",
        gameId: "game_retro_001",
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        pickLabel: "Más de 2.5 goles",
        origin: "Explorador",
        units: "1.00",
        userDecimal: "1.950",
        fairDecimal: "1.820",
        sealHash: "a".repeat(64),
        sealedAt: sealTime,
        kickoffAt: pastKickoff,
      });
    } catch (err) {
      const causeMsg =
        err instanceof Error && "cause" in err && err.cause instanceof Error
          ? err.cause.message
          : "";
      retroErrMsg = `${err instanceof Error ? err.message : String(err)} ${causeMsg}`;
    }
    expect(retroErrMsg).toContain("RETROACTIVE_SEALED_PICK_FORBIDDEN");

    const inserts = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        db
          .insert(sealedPicks)
          .values({
            userId: member.id,
            pickId: "pick_race_001",
            gameId: "game_race_001",
            leagueLabel: "Liga MX",
            matchLabel: "América vs Chivas",
            pickLabel: "Más de 2.5 goles",
            origin: "Explorador",
            units: "1.00",
            userDecimal: "1.950",
            fairDecimal: "1.820",
            sealHash: `${String(idx).repeat(64)}`.slice(0, 64),
            sealedAt: sealTime,
            kickoffAt: futureKickoff,
          })
          .onConflictDoNothing()
          .returning({ id: sealedPicks.id }),
      ),
    );
    expect(inserts.filter((rows) => rows.length === 1)).toHaveLength(1);

    const saved = await db.select().from(sealedPicks).where(eq(sealedPicks.userId, member.id));
    expect(saved).toHaveLength(1);

    await expect(
      pgliteClient.query(
        `UPDATE sealed_picks SET user_decimal = 2.500 WHERE id = $1`,
        [saved[0]!.id],
      ),
    ).rejects.toThrow();

    await expect(
      pgliteClient.query(`DELETE FROM sealed_picks WHERE id = $1`, [saved[0]!.id]),
    ).rejects.toThrow();
  });

  it("transfers: aprobaciones concurrentes y carrera aprobar vs rechazar garantizan exclusión mutua", async () => {
    const socioA = await newMember("spei-a@example.com", "spei_a");
    const socioB = await newMember("spei-b@example.com", "spei_b");
    const admin = await newMember("admin@example.com", "admin_pl");

    const reqA = await createTransferRequest(db, {
      userId: socioA.id,
      planInterval: "monthly",
      originBank: "BBVA",
      reportedAmountCentavosMxn: 29900,
      receiptReference: "SPEI-RACE-A",
      now,
    });
    expect(reqA.ok).toBe(true);
    if (!reqA.ok) throw new Error("reqA");

    const approvals = await Promise.all(
      Array.from({ length: 4 }, () =>
        approveTransferRequest(db, {
          requestId: reqA.request.id,
          adminUserId: admin.id,
          adminEmail: admin.email,
          paidAt: now,
        }),
      ),
    );
    expect(approvals.every((r) => r.ok)).toBe(true);
    const issuedCouponsA = await db
      .select()
      .from(accessCoupons)
      .where(eq(accessCoupons.transferRequestId, reqA.request.id));
    expect(issuedCouponsA).toHaveLength(1);

    const reqB = await createTransferRequest(db, {
      userId: socioB.id,
      planInterval: "annual",
      originBank: "Santander",
      reportedAmountCentavosMxn: 239000,
      receiptReference: "SPEI-RACE-B",
      now,
    });
    expect(reqB.ok).toBe(true);
    if (!reqB.ok) throw new Error("reqB");

    const [approveRes, rejectRes] = await Promise.all([
      approveTransferRequest(db, {
        requestId: reqB.request.id,
        adminUserId: admin.id,
        adminEmail: admin.email,
        paidAt: now,
      }),
      rejectTransferRequest(db, {
        requestId: reqB.request.id,
        adminUserId: admin.id,
        adminEmail: admin.email,
        reason: "Comprobante ilegible",
        now,
      }),
    ]);

    expect([approveRes, rejectRes].filter((r) => r.ok)).toHaveLength(1);
    const [finalB] = await db
      .select()
      .from(transferPaymentRequests)
      .where(eq(transferPaymentRequests.id, reqB.request.id));
    const couponsB = await db
      .select()
      .from(accessCoupons)
      .where(eq(accessCoupons.transferRequestId, reqB.request.id));
    if (finalB?.status === "approved") {
      expect(couponsB).toHaveLength(1);
    } else {
      expect(finalB?.status).toBe("rejected");
      expect(couponsB).toHaveLength(0);
    }
  });

  it("coupons: cupón maxRedemptions=1 bajo tormenta paralela solo permite 1 canje", async () => {
    const admin = await newMember("cadmin@example.com", "cadmin_pl");
    const created = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      code: "UNICO2026",
      days: 30,
      maxRedemptions: 1,
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("coupon");

    const claimants = await Promise.all(
      Array.from({ length: 5 }, (_, i) => newMember(`c${i}@example.com`, `claimant_${i}`)),
    );
    const outcomes = await Promise.all(
      claimants.map((u) => redeemAccessCoupon(db, { userId: u.id, code: "UNICO2026", now })),
    );

    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    expect(outcomes.filter((r) => !r.ok && r.reason === "agotado")).toHaveLength(4);
    const redemptions = await db
      .select()
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, created.coupon.id));
    expect(redemptions).toHaveLength(1);

    const multi = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      code: "MULTI2026",
      days: 7,
      maxRedemptions: 5,
      now,
    });
    expect(multi.ok).toBe(true);
    const sameUserAttempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        redeemAccessCoupon(db, { userId: claimants[0]!.id, code: "MULTI2026", now }),
      ),
    );
    expect(sameUserAttempts.filter((r) => r.ok)).toHaveLength(1);
  });

  it("social: likes, comentario útil, follows y reportes paralelos mantienen conteos exactos y auto-hide único", async () => {
    const author = await newMember("author@example.com", "author_mx");
    const peers = await Promise.all(
      Array.from({ length: 4 }, (_, i) => newMember(`peer${i}@example.com`, `peer_${i}`)),
    );

    const createdPost = await createSocialPost(
      db,
      author.id,
      {
        leagueLabel: "Liga MX",
        matchLabel: "Cruz Azul vs Pumas",
        pickBadge: "Más de 2.5 goles",
        originType: "Spacetime Suite",
        body: "Cruz Azul domina posesión y genera 2.4 xG proyectado esta jornada.",
      },
      now,
    );
    expect(createdPost.ok).toBe(true);
    if (!createdPost.ok) throw new Error("post");

    const commentRes = await addSocialComment(
      db,
      peers[0]!.id,
      createdPost.id,
      "Buen dato sobre las llegadas por banda derecha.",
      now,
    );
    expect(commentRes.ok).toBe(true);
    if (!commentRes.ok) throw new Error("comment");

    const [likeStorm, helpfulStorm, followStorm] = await Promise.all([
      Promise.all(Array.from({ length: 6 }, () => setSocialLike(db, peers[0]!.id, createdPost.id, true, now))),
      Promise.all(
        Array.from({ length: 6 }, () =>
          setSocialCommentHelpful(db, peers[1]!.id, commentRes.comment.id, true, now, createdPost.id),
        ),
      ),
      Promise.all(Array.from({ length: 6 }, () => setSocialFollow(db, peers[0]!.id, author.handle!, true, now))),
    ]);

    expect(likeStorm.every((r) => r.ok && r.likes === 1)).toBe(true);
    expect(helpfulStorm.every((r) => r.ok && r.helpfulCount === 1)).toBe(true);
    expect(followStorm.every((r) => r.ok && r.following === true)).toBe(true);
    expect(await db.select().from(socialLikes).where(eq(socialLikes.postId, createdPost.id))).toHaveLength(1);
    expect(
      await db.select().from(socialFollows).where(eq(socialFollows.followedUserId, author.id)),
    ).toHaveLength(1);

    const reports = await Promise.all(
      peers.map((p) =>
        reportSocialContent(db, p.id, { postId: createdPost.id, reason: "spam_enlaces" }, now),
      ),
    );
    expect(reports.filter((r) => r.ok)).toHaveLength(4);
    expect(reports.filter((r) => r.ok && r.autoHidden)).toHaveLength(1);

    const modLogs = await db
      .select()
      .from(socialModerationLogs)
      .where(eq(socialModerationLogs.userId, author.id));
    expect(modLogs).toHaveLength(1);
  });

  it("alerts y preferences: creación paralela respeta topes y parches concurrentes no se pisan entre sí", async () => {
    const member = await newMember("prefs@example.com", "prefs_mx");

    await Promise.all([
      upsertUserPreferences(db, member.id, { oddsFormat: "decimal" }, now),
      upsertUserPreferences(db, member.id, { themeMode: "light" }, now),
      upsertUserPreferences(db, member.id, { showMxnBalance: false }, now),
      upsertUserPreferences(db, member.id, { timezone: "America/Monterrey" }, now),
    ]);

    const finalPrefs = await getUserPreferences(db, member.id);
    expect(finalPrefs.oddsFormat).toBe("decimal");
    expect(finalPrefs.themeMode).toBe("light");
    expect(finalPrefs.showMxnBalance).toBe(false);
    expect(finalPrefs.timezone).toBe("America/Monterrey");

    const alertResults = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createMarketAlert(db, member.id, {
          name: `Alerta Liga MX #${i + 1}`,
          trigger: "stale_line_ev",
          league: "liga-mx",
          thresholdEvPct: 4.5,
          cooldownMinutes: 30,
          channel: "in_app",
        }),
      ),
    );
    expect(alertResults.every((r) => r.ok)).toBe(true);
    expect(await countActiveMarketAlertsForUser(db, member.id)).toBe(6);
    expect(await listMarketAlertsForUser(db, member.id, { limit: 10 })).toHaveLength(6);
  });
});
