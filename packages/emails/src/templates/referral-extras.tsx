import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, greeting, P, Title } from "../components";
import { EmailLayout } from "../layout";

/* 22 · Ya eres embajador ---------------------------------------------------------------- */

export interface ReferralAmbassadorProps {
  name?: string;
  /** Invitados que se quedaron: 5. */
  count: number;
  bonusDays: number;
  planName: string;
  accessUntil?: string;
  referralsUrl?: string;
}

export const referralAmbassadorSubject = () => "Ya eres embajador de PitchLab";

export function ReferralAmbassadorEmail({
  name,
  count,
  bonusDays,
  planName,
  accessUntil,
  referralsUrl = `${siteUrl()}/app/account/referrals`,
}: ReferralAmbassadorProps) {
  return (
    <EmailLayout preview={`${count} invitados se quedaron. Sumamos ${bonusDays} días a tu cuenta.`}>
      <Eyebrow>Referidos</Eyebrow>
      <Title>Ya eres embajador</Title>
      <P>
        {greeting(name)} {count} de tus invitados se quedaron en PitchLab. Por eso sumamos {bonusDays} días de{" "}
        {planName} a tu cuenta.
      </P>
      <Facts
        rows={[
          ["Invitados que se quedaron", String(count)],
          ["Bono", `${bonusDays} días de ${planName}`],
          ...(accessUntil ? ([["Acceso hasta", accessUntil]] as const) : []),
        ]}
      />
      <Cta href={referralsUrl}>Ver mis invitaciones</Cta>
    </EmailLayout>
  );
}

/* 23 · Revertimos una recompensa -------------------------------------------------------- */

export interface ReferralReversedProps {
  name?: string;
  /** Sin nombre se dice «Una persona que invitaste». */
  friendName?: string;
  days: number;
  accessUntil?: string;
  referralsUrl?: string;
}

export const referralReversedSubject = () => "Revertimos una recompensa de referido";

export function ReferralReversedEmail({
  name,
  friendName,
  days,
  accessUntil,
  referralsUrl = `${siteUrl()}/app/account/referrals`,
}: ReferralReversedProps) {
  return (
    <EmailLayout preview={`Quitamos ${days} días por un reembolso de tu invitado.`}>
      <Eyebrow>Referidos</Eyebrow>
      <Title>Revertimos una recompensa</Title>
      <P>
        {greeting(name)} {friendName ?? "Una persona que invitaste"} pidió un reembolso en sus primeros 14 días, así
        que quitamos los {days} días que habías ganado por esa invitación.
      </P>
      <Facts
        rows={[
          ["Días revertidos", String(days)],
          ...(accessUntil ? ([["Tu acceso ahora llega hasta", accessUntil]] as const) : []),
        ]}
      />
      <Cta href={referralsUrl}>Ver mis invitaciones</Cta>
    </EmailLayout>
  );
}
