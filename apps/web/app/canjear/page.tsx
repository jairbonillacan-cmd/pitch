import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createDb, normalizeCouponCode, validateCouponPreview, type Db } from "@pitchlab/db";
import { CanjearCouponView, type CouponPreviewState } from "@pitchlab/ui/canjear";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadPublicPlatformState } from "../../src/server/platform-data";
import { COUPON_ERROR_COPY } from "../../src/server/transfer-helpers";
import { getViewerAccess } from "../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canjear cupón · PitchLab",
  description: "Activa tu suscripción de Pase PitchLab Ultra con tu código de cupón.",
  robots: { index: false, follow: false },
};

let cachedDb: Db | null = null;

export default async function PublicCanjearPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string | string[]; code?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const raw = Array.isArray(sp.codigo)
    ? sp.codigo[0]
    : sp.codigo ?? (Array.isArray(sp.code) ? sp.code[0] : sp.code) ?? "";
  const cleanCode = raw.trim() ? normalizeCouponCode(raw) : "";

  const access = await getViewerAccess();
  const nextClubUrl = cleanCode
    ? `/app/canjear?codigo=${encodeURIComponent(cleanCode)}`
    : "/app/canjear";

  if (access.via === "account") {
    if (!access.signupComplete) {
      redirect(`/signup?paso=2&via=cuenta&next=${encodeURIComponent(nextClubUrl)}`);
    }
    redirect(nextClubUrl);
  }

  const state = await loadPublicPlatformState();
  let initialPreview: CouponPreviewState | null = null;
  if (cleanCode && process.env.DATABASE_URL) {
    try {
      cachedDb ??= createDb(process.env.DATABASE_URL) as unknown as Db;
      const res = await validateCouponPreview(cachedDb, { code: cleanCode, userId: null });
      initialPreview = res.valid
        ? {
            valid: true,
            coupon: {
              code: res.coupon.code,
              days: res.coupon.days,
              maxRedemptions: res.coupon.maxRedemptions,
              expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
              isTransferCoupon: res.coupon.isTransferCoupon,
              isPersonal: res.coupon.isPersonal,
            },
          }
        : {
            valid: false,
            reason: res.reason,
            error: COUPON_ERROR_COPY[res.reason]?.message ?? "Cupón no disponible.",
            coupon: res.coupon
              ? {
                  code: res.coupon.code,
                  days: res.coupon.days,
                  maxRedemptions: res.coupon.maxRedemptions,
                  expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
                  isTransferCoupon: res.coupon.isTransferCoupon,
                  isPersonal: res.coupon.isPersonal,
                }
              : null,
          };
    } catch (err) {
      void err;
    }
  }

  return (
    <PlatformClientBridge
      dataset={{ ...state.dataset, leagues: [], games: [] }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      viewerVia={state.viewerVia}
      paymentMode={state.paymentMode}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <CanjearCouponView
        mode="public"
        initialCode={cleanCode}
        initialPreview={initialPreview}
      />
    </PlatformClientBridge>
  );
}
