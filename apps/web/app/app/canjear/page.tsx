import React from "react";
import type { Metadata } from "next";
import { createDb, normalizeCouponCode, validateCouponPreview, type Db } from "@pitchlab/db";
import { CanjearCouponView, type CouponPreviewState } from "@pitchlab/ui/canjear";
import { getViewerAccountUserId } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canjear cupón · PitchLab",
  description: "Suma días de Pase PitchLab Ultra con tu código de cupón.",
};

const PREVIEW_MESSAGES: Record<string, string> = {
  no_existe: "No encontramos ese código. Revisa que esté bien escrito.",
  inactivo: "Este cupón fue desactivado por el equipo de PitchLab.",
  vencido: "La fecha límite de este cupón ya venció.",
  agotado: "Este cupón ya alcanzó su límite máximo de canjes.",
  ya_canjeado: "Ya canjeaste este cupón en tu cuenta.",
};

let cachedDb: Db | null = null;

export default async function ClubCanjearPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string | string[]; code?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const raw = Array.isArray(sp.codigo)
    ? sp.codigo[0]
    : sp.codigo ?? (Array.isArray(sp.code) ? sp.code[0] : sp.code) ?? "";
  const cleanCode = raw.trim() ? normalizeCouponCode(raw) : "";

  let initialPreview: CouponPreviewState | null = null;
  if (cleanCode && process.env.DATABASE_URL) {
    try {
      cachedDb ??= createDb(process.env.DATABASE_URL) as unknown as Db;
      const accountUserId = await getViewerAccountUserId();
      const res = await validateCouponPreview(cachedDb, {
        code: cleanCode,
        userId: accountUserId,
      });
      initialPreview = res.valid
        ? {
            valid: true,
            coupon: {
              code: res.coupon.code,
              days: res.coupon.days,
              expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
            },
          }
        : {
            valid: false,
            reason: res.reason,
            error: PREVIEW_MESSAGES[res.reason] ?? "Cupón no disponible.",
            coupon: res.coupon
              ? {
                  code: res.coupon.code,
                  days: res.coupon.days,
                  expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
                }
              : null,
          };
    } catch (err) {
      void err;
    }
  }

  return (
    <CanjearCouponView
      mode="club"
      initialCode={cleanCode}
      initialPreview={initialPreview}
    />
  );
}
