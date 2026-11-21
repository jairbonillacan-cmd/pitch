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
import { withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS_PER_TABLE = 5_000;

export const GET = withSessionRead(
  {
    bucket: "me-export",
    allowBeta: false,
    limit: 5,
    windowMs: 3_600_000,
  },
  async ({ user }) => {
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
      user.db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          handle: users.handle,
          bio: users.bio,
          avatarUrl: users.avatarUrl,
          xUsername: users.xUsername,
          referralCode: users.referralCode,
          speiReferenceCode: users.speiReferenceCode,
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
        .where(eq(users.id, user.userId))
        .limit(1),
      getUserPreferences(user.db, user.userId),
      user.db
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
        .where(eq(entitlementGrants.userId, user.userId))
        .orderBy(desc(entitlementGrants.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
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
        .where(eq(transferPaymentRequests.userId, user.userId))
        .orderBy(desc(transferPaymentRequests.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
        .select({
          id: couponRedemptions.id,
          couponId: couponRedemptions.couponId,
          createdAt: couponRedemptions.createdAt,
        })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.userId, user.userId))
        .orderBy(desc(couponRedemptions.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
        .select({
          id: sealedPicks.id,
          pickId: sealedPicks.pickId,
          gameId: sealedPicks.gameId,
          leagueLabel: sealedPicks.leagueLabel,
          matchLabel: sealedPicks.matchLabel,
          pickLabel: sealedPicks.pickLabel,
          origin: sealedPicks.origin,
          pickKind: sealedPicks.pickKind,
          pickMarket: sealedPicks.pickMarket,
          pickSelection: sealedPicks.pickSelection,
          pickLine: sealedPicks.pickLine,
          parlayLegs: sealedPicks.parlayLegs,
          parlayLegResults: sealedPicks.parlayLegResults,
          units: sealedPicks.units,
          userDecimal: sealedPicks.userDecimal,
          fairDecimal: sealedPicks.fairDecimal,
          closingDecimal: sealedPicks.closingDecimal,
          clvPct: sealedPicks.clvPct,
          status: sealedPicks.status,
          note: sealedPicks.note,
          sealedAt: sealedPicks.sealedAt,
          kickoffAt: sealedPicks.kickoffAt,
          settledAt: sealedPicks.settledAt,
        })
        .from(sealedPicks)
        .where(eq(sealedPicks.userId, user.userId))
        .orderBy(desc(sealedPicks.sealedAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
        .select({
          gameId: watchlist.gameId,
          createdAt: watchlist.createdAt,
        })
        .from(watchlist)
        .where(eq(watchlist.userId, user.userId))
        .orderBy(desc(watchlist.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
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
        .where(eq(socialPosts.authorUserId, user.userId))
        .orderBy(desc(socialPosts.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
      user.db
        .select({
          id: socialComments.id,
          postId: socialComments.postId,
          body: socialComments.body,
          createdAt: socialComments.createdAt,
        })
        .from(socialComments)
        .where(eq(socialComments.authorUserId, user.userId))
        .orderBy(desc(socialComments.createdAt))
        .limit(EXPORT_MAX_ROWS_PER_TABLE),
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
      },
    });
  },
);
