import "../precio-motion.css";
import "../account-v2.css";
import React from "react";
import type { Metadata } from "next";
import {
  ensureUserSpeiReference,
  hasActivePaseTotal,
  listUserTransferRequests,
  quoteTransferAmountCentavos,
} from "@pitchlab/db";
import { supportEmail } from "@pitchlab/emails";
import {
  MEMBERSHIP_SPEC,
  PrecioPageSurface,
  type PrecioTransferContext,
} from "@pitchlab/ui/public-sections";
import { LANDING_FAQS } from "@pitchlab/ui/spacetime-catalog";
import { getTransferBankConfig, paymentMode } from "../../src/server/billing/payment-mode";
import { buildPricingPageJsonLd, JsonLd } from "../../src/server/json-ld";
import { serializeTransferRequest } from "../../src/server/member-plan";
import { hasPublicSessionCookie } from "../../src/server/public-session";
import { serverDb } from "../../src/server/session-user";
import { getSiteUrl } from "../../src/server/site-url";
import { getViewerAccess, getViewerAccountUserId } from "../../src/server/viewer-access";

// Dinámico por diseño (ADR-053): entrega referencia SPEI, cotización con referido y estado del pase por cuenta.
export const dynamic = "force-dynamic";

const TITLE = "Precio · PitchLab";
const DESCRIPTION = `Pase PitchLab Ultra: $${MEMBERSHIP_SPEC.monthlyMxn} MXN/mes o $${MEMBERSHIP_SPEC.annualMxn.toLocaleString("en-US")} MXN/año con IVA incluido y factura CFDI. 7 días gratis sin tarjeta y pago vía SPEI.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/precio" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/precio",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function PrecioPage(): Promise<React.JSX.Element> {
  const mode = paymentMode();
  const accountsEnabled = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
  const access = await getViewerAccess();
  const hasSession = access.via !== "none" || (await hasPublicSessionCookie());

  let transferContext: PrecioTransferContext = {
    paymentMode: mode,
    accountsEnabled,
    viewerState: "guest",
    memberHandle: null,
    speiReferenceCode: null,
    bank: null,
    quotes: {
      monthlyCentavos: MEMBERSHIP_SPEC.monthlyMxn * 100,
      annualCentavos: MEMBERSHIP_SPEC.annualMxn * 100,
      referralDiscountApplied: false,
    },
    activePending: null,
    latestApproved: null,
    latestRejected: null,
    activePass: false,
  };

  if (mode === "transfer") {
    if (access.via === "account" && !access.signupComplete) {
      transferContext = {
        ...transferContext,
        viewerState: "incomplete_signup",
      };
    } else if (access.via === "account" && access.signupComplete) {
      const db = serverDb();
      const userId = await getViewerAccountUserId();
      if (db && userId) {
        const [speiReferenceCode, monthlyQuote, annualQuote, rows, activePass] =
          await Promise.all([
            ensureUserSpeiReference(db, userId),
            quoteTransferAmountCentavos(db, userId, "monthly"),
            quoteTransferAmountCentavos(db, userId, "annual"),
            listUserTransferRequests(db, userId, 10),
            hasActivePaseTotal(db, userId, new Date()),
          ]);
        const history = rows.map(serializeTransferRequest);
        transferContext = {
          paymentMode: mode,
          accountsEnabled,
          viewerState: "member",
          memberHandle: access.profile?.handle ?? null,
          speiReferenceCode,
          bank: {
            ...getTransferBankConfig(),
            supportEmail: supportEmail(),
          },
          quotes: {
            monthlyCentavos: monthlyQuote.amountCentavosMxn,
            annualCentavos: annualQuote.amountCentavosMxn,
            referralDiscountApplied: monthlyQuote.referralDiscountApplied,
          },
          activePending: history.find((item) => item.status === "pending_review") ?? null,
          latestApproved: history.find((item) => item.status === "approved") ?? null,
          latestRejected: history.find((item) => item.status === "rejected") ?? null,
          activePass,
        };
      }
    } else if (access.via === "beta") {
      transferContext = {
        ...transferContext,
        viewerState: "beta_preview",
        memberHandle: "socio_mx",
        speiReferenceCode: "PL-SOCIOMX-8K4P",
        bank: {
          ...getTransferBankConfig(),
          supportEmail: supportEmail(),
        },
      };
    }
  }

  return (
    <>
      <JsonLd data={buildPricingPageJsonLd(getSiteUrl(), MEMBERSHIP_SPEC, LANDING_FAQS)} />
      <PrecioPageSurface hasSession={hasSession} transferContext={transferContext} />
    </>
  );
}
