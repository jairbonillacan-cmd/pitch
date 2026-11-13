import { NextResponse } from "next/server";
import {
  couponRedemptions,
  desc,
  entitlementGrants,
  eq,
  getUserPreferences,
  sealedPicks,
  socialComments,
  socialPosts,
  transferPaymentRequests,
  users,
  watchlist,
} from "@pitchlab/db";
import { checkEndpointRateLimit, rateLimitResponse } from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/export — descarga en JSON todos los datos personales y de actividad del socio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-export",
    key: member.userId,
    limit: 5,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const [
    [profile],
    preferences,
    grants,
    transfers,
    coupons,
    journalEntries,
    watchlistRows,
    posts,
    comments,
  ] = await Promise.all([
    member.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        handle: users.handle,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        xUsername: users.xUsername,
        referralCode: users.referralCode,
        isAmbassador: users.isAmbassador,
        isAdult: users.isAdult,
        publicProfile: users.publicProfile,
        socialPauseEnabled: users.socialPauseEnabled,
        birthDate: users.birthDate,
        termsVersion: users.termsVersion,
        termsAcceptedAt: users.termsAcceptedAt,
        analyticsConsent: users.analyticsConsent,
        marketingConsent: users.marketingConsent,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, member.userId))
      .limit(1),
    getUserPreferences(member.db, member.userId),
    member.db
      .select({
        id: entitlementGrants.id,
        sourceKind: entitlementGrants.sourceKind,
        daysGranted: entitlementGrants.daysGranted,
        startsAt: entitlementGrants.startsAt,
        endsAt: entitlementGrants.endsAt,
        revokedAt: entitlementGrants.revokedAt,
        revokeReason: entitlementGrants.revokeReason,
        createdAt: entitlementGrants.createdAt,
      })
      .from(entitlementGrants)
      .where(eq(entitlementGrants.userId, member.userId))
      .orderBy(desc(entitlementGrants.createdAt)),
    member.db
      .select({
        id: transferPaymentRequests.id,
        planInterval: transferPaymentRequests.planInterval,
        amountCentavosMxn: transferPaymentRequests.amountCentavosMxn,
        reportedAmountCentavosMxn: transferPaymentRequests.reportedAmountCentavosMxn,
        referenceCode: transferPaymentRequests.referenceCode,
        originBank: transferPaymentRequests.originBank,
        receiptReference: transferPaymentRequests.receiptReference,
        transferDate: transferPaymentRequests.transferDate,
        status: transferPaymentRequests.status,
        rejectionReason: transferPaymentRequests.rejectionReason,
        createdAt: transferPaymentRequests.createdAt,
        reviewedAt: transferPaymentRequests.reviewedAt,
      })
      .from(transferPaymentRequests)
      .where(eq(transferPaymentRequests.userId, member.userId))
      .orderBy(desc(transferPaymentRequests.createdAt)),
    member.db
      .select({
        id: couponRedemptions.id,
        couponId: couponRedemptions.couponId,
        createdAt: couponRedemptions.createdAt,
      })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.userId, member.userId))
      .orderBy(desc(couponRedemptions.createdAt)),
    member.db
      .select({
        id: sealedPicks.id,
        pickId: sealedPicks.pickId,
        gameId: sealedPicks.gameId,
        leagueLabel: sealedPicks.leagueLabel,
        matchLabel: sealedPicks.matchLabel,
        pickLabel: sealedPicks.pickLabel,
        origin: sealedPicks.origin,
        units: sealedPicks.units,
        userDecimal: sealedPicks.userDecimal,
        fairDecimal: sealedPicks.fairDecimal,
        clvPct: sealedPicks.clvPct,
        status: sealedPicks.status,
        note: sealedPicks.note,
        sealedAt: sealedPicks.sealedAt,
        kickoffAt: sealedPicks.kickoffAt,
        settledAt: sealedPicks.settledAt,
      })
      .from(sealedPicks)
      .where(eq(sealedPicks.userId, member.userId))
      .orderBy(desc(sealedPicks.sealedAt)),
    member.db
      .select({
        gameId: watchlist.gameId,
        createdAt: watchlist.createdAt,
      })
      .from(watchlist)
      .where(eq(watchlist.userId, member.userId)),
    member.db
      .select({
        id: socialPosts.id,
        gameId: socialPosts.gameId,
        leagueLabel: socialPosts.leagueLabel,
        matchLabel: socialPosts.matchLabel,
        originType: socialPosts.originType,
        pickBadge: socialPosts.pickBadge,
        body: socialPosts.body,
        likesCount: socialPosts.likesCount,
        createdAt: socialPosts.createdAt,
      })
      .from(socialPosts)
      .where(eq(socialPosts.authorUserId, member.userId))
      .orderBy(desc(socialPosts.createdAt)),
    member.db
      .select({
        id: socialComments.id,
        postId: socialComments.postId,
        body: socialComments.body,
        createdAt: socialComments.createdAt,
      })
      .from(socialComments)
      .where(eq(socialComments.authorUserId, member.userId))
      .orderBy(desc(socialComments.createdAt)),
  ]);

  const safeHandle =
    (profile?.handle ?? "socio").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "socio";

  const payload = {
    version: "pitchlab-export-v1",
    exportedAtIso: new Date().toISOString(),
    profile: profile ?? null,
    preferences,
    entitlementGrants: grants,
    transferPaymentRequests: transfers,
    couponRedemptions: coupons,
    journalEntries,
    watchlist: watchlistRows,
    socialPosts: posts,
    socialComments: comments,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pitchlab-datos-${safeHandle}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
