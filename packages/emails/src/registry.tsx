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
  TipsterPayoutEmail,
  tipsterPayoutSubject,
  type CfdiInvoiceProps,
  type PaymentFailedProps,
  type PaymentReceiptProps,
  type RefundProps,
  type SubscriptionCanceledProps,
  type TipsterPayoutProps,
} from "./templates/billing";
import { ContentRemovedEmail, contentRemovedSubject, type ContentRemovedProps } from "./templates/community";
import { WeeklyDigestEmail, weeklyDigestSubject, type WeeklyDigestProps } from "./templates/digest";
import {
  AccessExpiredEmail,
  accessExpiredSubject,
  RenewalReminderEmail,
  renewalReminderSubject,
  type AccessExpiredProps,
  type RenewalReminderProps,
} from "./templates/plan";
import {
  MonthlyRecordEmail,
  monthlyRecordSubject,
  PickGradedEmail,
  pickGradedSubject,
  type MonthlyRecordProps,
  type PickGradedProps,
} from "./templates/product";
import {
  ReferralAmbassadorEmail,
  referralAmbassadorSubject,
  ReferralReversedEmail,
  referralReversedSubject,
  type ReferralAmbassadorProps,
  type ReferralReversedProps,
} from "./templates/referral-extras";
import {
  TipsterActivatedEmail,
  tipsterActivatedSubject,
  TipsterNewSubscriberEmail,
  tipsterNewSubscriberSubject,
  type TipsterActivatedProps,
  type TipsterNewSubscriberProps,
} from "./templates/tipster";
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
  /** Fase de construcción: A cuentas y prueba · B referidos · C cobro · D producto y seguridad · E Tipster y comunidad. */
  phase: "A" | "B" | "C" | "D" | "E";
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
      inviteUrl: "https://pitchlab.mx/pricing/referral?code=SOFIA5",
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
  "tipster-payout": define<TipsterPayoutProps>({
    phase: "E",
    label: "Pago de comisión Tipster",
    Component: TipsterPayoutEmail,
    subject: tipsterPayoutSubject,
    sample: {
      name: "Sofía",
      amountLabel: "$1,247.50 MXN",
      periodLabel: "octubre 2026",
      paidOn: "14 de noviembre de 2026",
      detailUrl: EXAMPLE_URL,
    },
  }),
  "renewal-reminder": define<RenewalReminderProps>({
    phase: "C",
    label: "Tu plan se renueva",
    Component: RenewalReminderEmail,
    subject: renewalReminderSubject,
    sample: {
      name: "Sofía",
      planName: "Pase PitchLab Ultra anual",
      daysLeft: 7,
      renewsOn: "19 de noviembre de 2027",
      amountLabel: "$2,390.00 MXN",
      cardLast4: "4242",
      manageUrl: EXAMPLE_URL,
    },
  }),
  "access-expired": define<AccessExpiredProps>({
    phase: "C",
    label: "Acceso en pausa por falta de pago",
    Component: AccessExpiredEmail,
    subject: accessExpiredSubject,
    sample: { name: "Sofía", planName: "Pase PitchLab Ultra", updateCardUrl: EXAMPLE_URL },
  }),
  "referral-ambassador": define<ReferralAmbassadorProps>({
    phase: "B",
    label: "Ya eres embajador",
    Component: ReferralAmbassadorEmail,
    subject: referralAmbassadorSubject,
    sample: {
      name: "Sofía",
      count: 5,
      bonusDays: 30,
      planName: "Pase PitchLab Ultra",
      accessUntil: "12 de enero",
      referralsUrl: EXAMPLE_URL,
    },
  }),
  "referral-reversed": define<ReferralReversedProps>({
    phase: "B",
    label: "Recompensa revertida",
    Component: ReferralReversedEmail,
    subject: referralReversedSubject,
    sample: { name: "Sofía", days: 15, accessUntil: "27 de noviembre", referralsUrl: EXAMPLE_URL },
  }),
  "pick-graded": define<PickGradedProps>({
    phase: "D",
    label: "Pick calificado",
    Component: PickGradedEmail,
    subject: pickGradedSubject,
    sample: {
      name: "Sofía",
      result: "won",
      matchLabel: "Cruz Azul vs Pumas",
      leagueLabel: "Liga MX",
      pickLabel: "Gana Cruz Azul",
      userOddsLabel: "-130",
      fairOddsLabel: "-138",
      clvLabel: "+3.2 pts",
      journalUrl: EXAMPLE_URL,
      settingsUrl: EXAMPLE_URL,
    },
  }),
  "monthly-record": define<MonthlyRecordProps>({
    phase: "D",
    label: "Tu mes en PitchLab",
    Component: MonthlyRecordEmail,
    subject: monthlyRecordSubject,
    sample: {
      name: "Sofía",
      monthLabel: "octubre 2026",
      balanceLabel: "+4.5 u",
      balancePositive: true,
      hitsLabel: "12 de 20",
      clvLabel: "+1.8 pts",
      rankLabel: "#41",
      bestLeague: { name: "Liga MX", record: "7 de 10" },
      journalUrl: EXAMPLE_URL,
      settingsUrl: EXAMPLE_URL,
    },
  }),
  "tipster-activated": define<TipsterActivatedProps>({
    phase: "E",
    label: "Código Tipster activo",
    Component: TipsterActivatedEmail,
    subject: tipsterActivatedSubject,
    sample: {
      name: "Sofía",
      promoCode: "SOFIA5",
      trialDays: 5,
      commissionPct: 25,
      shareUrl: "https://pitchlab.mx/pricing/referral?code=SOFIA5",
      dashboardUrl: EXAMPLE_URL,
    },
  }),
  "tipster-new-subscriber": define<TipsterNewSubscriberProps>({
    phase: "E",
    label: "Nueva suscripción con tu código",
    Component: TipsterNewSubscriberEmail,
    subject: tipsterNewSubscriberSubject,
    sample: {
      name: "Sofía",
      promoCode: "SOFIA5",
      planName: "Pase PitchLab Ultra",
      commissionLabel: "$55.60 MXN",
      netLabel: "$222.41 MXN",
      payableOn: "26 de noviembre de 2026",
      commissionsUrl: EXAMPLE_URL,
    },
  }),
  "content-removed": define<ContentRemovedProps>({
    phase: "E",
    label: "Publicación retirada",
    Component: ContentRemovedEmail,
    subject: contentRemovedSubject,
    sample: {
      name: "Sofía",
      removedOn: "12 de noviembre de 2026",
      reason: "Incluía un enlace de afiliado",
      rulesUrl: EXAMPLE_URL,
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
  const [rawHtml, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  // React 19 agrega <link rel="preload"> para las imágenes: en un correo no sirve y estorba.
  const html = rawHtml.replace(/<link rel="preload"[^>]*\/?>/g, "");
  return { subject: def.subject(props), html, text };
}
