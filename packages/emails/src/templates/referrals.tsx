import { siteUrl } from "../brand";
import { Cta, Facts, FallbackLink, greeting, Notice, P, Title } from "../components";
import { EmailLayout } from "../layout";

/* 5 · Tu amigo se registró -------------------------------------------------------------- */

export interface ReferralSignedUpProps {
  name?: string;
  friendName: string;
  status: "signed_up" | "trial";
  referralsUrl?: string;
}

export const referralSignedUpSubject = ({ friendName }: ReferralSignedUpProps) =>
  `${friendName} se unió a PitchLab con tu invitación`;

export function ReferralSignedUpEmail({
  name,
  friendName,
  status,
  referralsUrl = `${siteUrl()}/app/account/referrals`,
}: ReferralSignedUpProps) {
  return (
    <EmailLayout preview={`${friendName} entró con tu código.`}>
      <Title>{friendName} ya está dentro</Title>
      <P>
        {greeting(name)} {friendName} creó su cuenta con tu invitación
        {status === "trial" ? " y ya está usando su prueba." : "."}
      </P>
      <P>
        Tu recompensa llega cuando se convierta en suscriptor y pase el periodo de reembolso. Te avisamos en cuanto
        ocurra.
      </P>
      <Cta href={referralsUrl}>Ver mis invitaciones</Cta>
    </EmailLayout>
  );
}

/* 6 · Recompensa ganada ----------------------------------------------------------------- */

export interface ReferralRewardedProps {
  name?: string;
  friendName: string;
  rewardDays?: number;
  planName: string;
  accessUntil?: string;
  referralsUrl?: string;
}

export const referralRewardedSubject = ({ rewardDays = 30 }: ReferralRewardedProps) =>
  `Ganaste ${rewardDays} días de PitchLab`;

export function ReferralRewardedEmail({
  name,
  friendName,
  rewardDays = 30,
  planName,
  accessUntil,
  referralsUrl = `${siteUrl()}/app/account/referrals`,
}: ReferralRewardedProps) {
  return (
    <EmailLayout preview={`${friendName} se quedó. Sumamos ${rewardDays} días a tu cuenta.`}>
      <Title>Ganaste {rewardDays} días</Title>
      <P>
        {greeting(name)} {friendName} se quedó en PitchLab y ya pasó el periodo de reembolso. Agregamos{" "}
        {rewardDays} días de {planName} a tu cuenta.
      </P>
      <Facts
        rows={[
          ["Recompensa", `${rewardDays} días de ${planName}`],
          ...(accessUntil ? ([["Acceso hasta", accessUntil]] as const) : []),
        ]}
      />
      <Cta href={referralsUrl}>Ver mis invitaciones</Cta>
      <P muted>Las recompensas dependen solo de que tus invitados se queden, nunca de tus pronósticos.</P>
    </EmailLayout>
  );
}

/* 7 · Invitación ------------------------------------------------------------------------ */

export interface InviteProps {
  /** Quién invita. Sin nombre, la invitación es de PitchLab. */
  inviterName?: string;
  planName: string;
  days: number;
  inviteUrl: string;
  expiresOn?: string;
}

export const inviteSubject = ({ inviterName }: InviteProps) =>
  inviterName ? `${inviterName} te invitó a PitchLab` : "Te invitaron a PitchLab";

export function InviteEmail({ inviterName, planName, days, inviteUrl, expiresOn }: InviteProps) {
  return (
    <EmailLayout preview={`${days} días de ${planName}, sin tarjeta.`}>
      <Title>{inviterName ? `${inviterName} te invitó a PitchLab` : "Te invitaron a PitchLab"}</Title>
      <P>Lo más probable de cada partido, con su cuota justa. Con esta invitación tienes:</P>
      <Facts
        rows={[
          ["Acceso", `${days} días de ${planName}`],
          ["Tarjeta", "No hace falta"],
          ...(expiresOn ? ([["La invitación vence", expiresOn]] as const) : []),
        ]}
      />
      <Cta href={inviteUrl}>Aceptar invitación</Cta>
      <FallbackLink href={inviteUrl} />
      <Notice tone="info">Solo mayores de 18. Si no esperabas esta invitación, ignora el correo.</Notice>
    </EmailLayout>
  );
}
