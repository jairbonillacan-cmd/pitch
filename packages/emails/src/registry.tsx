import { render } from "@react-email/components";
import type { ReactElement } from "react";

import {
  MagicLinkEmail,
  magicLinkSubject,
  SecurityNoticeEmail,
  securityNoticeSubject,
  TrialEndedEmail,
  trialEndedSubject,
  TrialEndingEmail,
  trialEndingSubject,
  WelcomeEmail,
  welcomeSubject,
  type MagicLinkProps,
  type SecurityNoticeProps,
  type TrialEndedProps,
  type TrialEndingProps,
  type WelcomeProps,
} from "./templates/account";
import {
  CfdiInvoiceEmail,
  cfdiInvoiceSubject,
  PaymentFailedEmail,
  paymentFailedSubject,
  PaymentReceiptEmail,
  paymentReceiptSubject,
  RefundEmail,
  refundSubject,
  SubscriptionCanceledEmail,
  subscriptionCanceledSubject,
  TipstarPayoutEmail,
  tipstarPayoutSubject,
  type CfdiInvoiceProps,
  type PaymentFailedProps,
  type PaymentReceiptProps,
  type RefundProps,
  type SubscriptionCanceledProps,
  type TipstarPayoutProps,
} from "./templates/billing";
import { WeeklyDigestEmail, weeklyDigestSubject, type WeeklyDigestProps } from "./templates/digest";
import {
  InviteEmail,
  inviteSubject,
  ReferralRewardedEmail,
  referralRewardedSubject,
  ReferralSignedUpEmail,
  referralSignedUpSubject,
  type InviteProps,
  type ReferralRewardedProps,
  type ReferralSignedUpProps,
} from "./templates/referrals";

/** Cada correo: componente, asunto y datos de ejemplo (para la vista previa y las pruebas). */
interface Definition<P> {
  /** Fase de construcción: A cuentas y prueba · B referidos · C cobro · D producto y seguridad. */
  phase: "A" | "B" | "C" | "D";
  label: string;
  Component: (props: P) => ReactElement;
  subject: (props: P) => string;
  sample: P;
}

function define<P>(def: Definition<P>): Definition<P> {
  return def;
}

const EXAMPLE_URL = "https://pitchlab.mx/ejemplo";

export const EMAIL_TEMPLATES = {
  "magic-link": define<MagicLinkProps>({
    phase: "A",
    label: "Enlace de acceso",
    Component: MagicLinkEmail,
    subject: magicLinkSubject,
    sample: { url: "https://pitchlab.mx/api/auth/magic-link/verify?token=ejemplo&callbackURL=%2Fapp" },
  }),
  welcome: define<WelcomeProps>({
    phase: "A",
    label: "Bienvenida (día 0)",
    Component: WelcomeEmail,
    subject: welcomeSubject,
    sample: { name: "Sofía" },
  }),
  "trial-ending": define<TrialEndingProps>({
    phase: "A",
    label: "Quedan 2 días (día 5)",
    Component: TrialEndingEmail,
    subject: trialEndingSubject,
    sample: {
      name: "Sofía",
      planName: "Pase PitchLab Ultra",
      priceLabel: "$299 MXN al mes, IVA incluido",
      endsOn: "14 de noviembre",
      manageUrl: EXAMPLE_URL,
    },
  }),
  "trial-ended": define<TrialEndedProps>({
    phase: "A",
    label: "Fin de la prueba (día 7)",
    Component: TrialEndedEmail,
    subject: trialEndedSubject,
    sample: { name: "Sofía", outcome: "free", planName: "Pase PitchLab Ultra", manageUrl: EXAMPLE_URL },
  }),
  "referral-signed-up": define<ReferralSignedUpProps>({
    phase: "B",
    label: "Tu amigo se registró",
    Component: ReferralSignedUpEmail,
    subject: referralSignedUpSubject,
    sample: { name: "Sofía", friendName: "Diego", status: "trial", referralsUrl: EXAMPLE_URL },
  }),
  "referral-rewarded": define<ReferralRewardedProps>({
    phase: "B",
    label: "Recompensa ganada",
    Component: ReferralRewardedEmail,
    subject: referralRewardedSubject,
    sample: {
      name: "Sofía",
      friendName: "Diego",
      planName: "Pase PitchLab Ultra",
      accessUntil: "12 de diciembre",
      referralsUrl: EXAMPLE_URL,
    },
  }),
  invite: define<InviteProps>({
    phase: "B",
    label: "Invitación",
    Component: InviteEmail,
    subject: inviteSubject,
    sample: {
      inviterName: "Sofía",
      planName: "Pase PitchLab Ultra",
      days: 7,
      inviteUrl: "https://pitchlab.mx/signup?code=SOFIA5",
      expiresOn: "30 de noviembre",
    },
  }),
  "payment-receipt": define<PaymentReceiptProps>({
    phase: "C",
    label: "Pago confirmado",
    Component: PaymentReceiptEmail,
    subject: paymentReceiptSubject,
    sample: {
      name: "Sofía",
      planName: "Pase PitchLab Ultra",
      amountLabel: "$299.00 MXN",
      paidOn: "12 de noviembre de 2026",
      periodLabel: "12 nov – 12 dic 2026",
      cardLast4: "4242",
      receiptUrl: EXAMPLE_URL,
      invoiceComing: true,
    },
  }),
  "payment-failed": define<PaymentFailedProps>({
    phase: "C",
    label: "Falló el pago",
    Component: PaymentFailedEmail,
    subject: paymentFailedSubject,
    sample: {
      name: "Sofía",
      planName: "Pase PitchLab Ultra",
      amountLabel: "$299.00 MXN",
      graceUntil: "15 de noviembre",
      updateCardUrl: EXAMPLE_URL,
    },
  }),
  "cfdi-invoice": define<CfdiInvoiceProps>({
    phase: "C",
    label: "Factura CFDI",
    Component: CfdiInvoiceEmail,
    subject: cfdiInvoiceSubject,
    sample: {
      name: "Sofía",
      folio: "PL-000123",
      amountLabel: "$299.00 MXN",
      issuedOn: "12 de noviembre de 2026",
      legalName: "SOFIA LOPEZ GARCIA",
      downloadUrl: EXAMPLE_URL,
    },
  }),
  refund: define<RefundProps>({
    phase: "C",
    label: "Reembolso o disputa",
    Component: RefundEmail,
    subject: refundSubject,
    sample: { name: "Sofía", kind: "refund", amountLabel: "$299.00 MXN", happenedOn: "13 de noviembre de 2026" },
  }),
  "subscription-canceled": define<SubscriptionCanceledProps>({
    phase: "C",
    label: "Suscripción cancelada",
    Component: SubscriptionCanceledEmail,
    subject: subscriptionCanceledSubject,
    sample: { name: "Sofía", planName: "Pase PitchLab Ultra", accessUntil: "12 de diciembre", resumeUrl: EXAMPLE_URL },
  }),
  "tipstar-payout": define<TipstarPayoutProps>({
    phase: "C",
    label: "Pago de comisión Tipstar",
    Component: TipstarPayoutEmail,
    subject: tipstarPayoutSubject,
    sample: {
      name: "Sofía",
      amountLabel: "$1,247.50 MXN",
      periodLabel: "octubre 2026",
      paidOn: "14 de noviembre de 2026",
      detailUrl: EXAMPLE_URL,
    },
  }),
  "weekly-digest": define<WeeklyDigestProps>({
    phase: "D",
    label: "Resumen semanal",
    Component: WeeklyDigestEmail,
    subject: weeklyDigestSubject,
    sample: {
      name: "Sofía",
      weekLabel: "9 – 15 de noviembre",
      unsubscribeUrl: EXAMPLE_URL,
      items: [
        {
          match: "Cruz Azul vs Pumas",
          league: "Liga MX",
          kickoff: "sáb 14 nov · 19:00",
          outcome: "gana Cruz Azul",
          probability: "58 %",
          fairOdds: "1.72",
        },
        {
          match: "Real Madrid vs Girona",
          league: "LaLiga",
          kickoff: "dom 15 nov · 14:00",
          outcome: "gana Real Madrid",
          probability: "71 %",
          fairOdds: "1.41",
        },
      ],
    },
  }),
  "security-notice": define<SecurityNoticeProps>({
    phase: "D",
    label: "Aviso de seguridad",
    Component: SecurityNoticeEmail,
    subject: securityNoticeSubject,
    sample: {
      name: "Sofía",
      kind: "new-device",
      device: "Chrome en Windows",
      location: "Ciudad de México, MX",
      when: "12 de noviembre de 2026, 11:42",
      secureUrl: EXAMPLE_URL,
    },
  }),
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATES;

type PropsOf<K extends EmailTemplateId> = (typeof EMAIL_TEMPLATES)[K] extends Definition<infer P> ? P : never;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Genera asunto, HTML y texto plano de un correo. */
export async function renderEmail<K extends EmailTemplateId>(id: K, props: PropsOf<K>): Promise<RenderedEmail> {
  const def = EMAIL_TEMPLATES[id] as unknown as Definition<PropsOf<K>>;
  const element = def.Component(props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: def.subject(props), html, text };
}
