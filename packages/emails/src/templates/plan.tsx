import { Cta, Eyebrow, Facts, greeting, P, Title } from "../components";
import { EmailLayout } from "../layout";

/* 20 · Tu plan se renueva --------------------------------------------------------------- */

export interface RenewalReminderProps {
  name?: string;
  planName: string;
  daysLeft: number;
  renewsOn: string;
  /** Ya con IVA. */
  amountLabel: string;
  cardLast4?: string;
  manageUrl: string;
}

export const renewalReminderSubject = ({ daysLeft }: RenewalReminderProps) =>
  `Tu plan de PitchLab se renueva en ${daysLeft} días`;

export function RenewalReminderEmail({
  name,
  planName,
  daysLeft,
  renewsOn,
  amountLabel,
  cardLast4,
  manageUrl,
}: RenewalReminderProps) {
  return (
    <EmailLayout preview={`Se cobrarán ${amountLabel} el ${renewsOn}. Aquí puedes cancelar.`}>
      <Eyebrow>Tu plan</Eyebrow>
      <Title>Tu plan se renueva en {daysLeft} días</Title>
      <P>
        {greeting(name)} Tu plan {planName} se renueva automáticamente. Si no quieres continuar, cancela antes de esa
        fecha.
      </P>
      <Facts
        rows={[
          ["Plan", planName],
          ["Renovación", renewsOn],
          ...(cardLast4 ? ([["Tarjeta", `•••• ${cardLast4}`]] as const) : []),
          ["Se cobrará (IVA incluido)", amountLabel],
        ]}
      />
      <Cta href={manageUrl}>Administrar mi plan</Cta>
    </EmailLayout>
  );
}

/* 21 · Acceso en pausa por falta de pago ----------------------------------------------- */

export interface AccessExpiredProps {
  name?: string;
  planName: string;
  updateCardUrl: string;
}

export const accessExpiredSubject = () => "Tu acceso completo a PitchLab está en pausa";

export function AccessExpiredEmail({ name, planName, updateCardUrl }: AccessExpiredProps) {
  return (
    <EmailLayout preview={`No pudimos cobrar ${planName}. Reactívalo cuando quieras.`}>
      <Eyebrow>Tu plan</Eyebrow>
      <Title>Tu acceso está en pausa</Title>
      <P>
        {greeting(name)} No pudimos cobrar tu plan {planName} y terminó el plazo de gracia. Tu bitácora y tu historial
        siguen contigo.
      </P>
      <Cta href={updateCardUrl}>Reactivar mi plan</Cta>
    </EmailLayout>
  );
}
