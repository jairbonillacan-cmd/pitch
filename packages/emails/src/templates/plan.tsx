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
  paymentMode?: "transfer" | "stripe";
  manageUrl: string;
}

export const renewalReminderSubject = ({ daysLeft, paymentMode }: RenewalReminderProps) =>
  paymentMode === "transfer"
    ? `Tu acceso de PitchLab vence en ${daysLeft} días`
    : `Tu plan de PitchLab se renueva en ${daysLeft} días`;

export function RenewalReminderEmail({
  name,
  planName,
  daysLeft,
  renewsOn,
  amountLabel,
  cardLast4,
  paymentMode = "stripe",
  manageUrl,
}: RenewalReminderProps) {
  const isTransfer = paymentMode === "transfer";
  return (
    <EmailLayout
      preview={
        isTransfer
          ? `Tu pase termina el ${renewsOn}. Renuévalo por transferencia SPEI o cupón.`
          : `Se cobrarán ${amountLabel} el ${renewsOn}. Aquí puedes cancelar.`
      }
    >
      <Eyebrow>Tu plan</Eyebrow>
      <Title>{isTransfer ? `Tu acceso vence en ${daysLeft} días` : `Tu plan se renueva en ${daysLeft} días`}</Title>
      <P>
        {greeting(name)}{" "}
        {isTransfer
          ? `Tu ${planName} vence el ${renewsOn}. No hacemos cobros automáticos: puedes renovarlo por transferencia SPEI o con un cupón desde tu cuenta.`
          : `Tu plan ${planName} se renueva automáticamente. Si no quieres continuar, cancela antes de esa fecha.`}
      </P>
      <Facts
        rows={[
          ["Plan", planName],
          [isTransfer ? "Vence el" : "Renovación", renewsOn],
          ...(cardLast4 && !isTransfer ? ([["Tarjeta", `•••• ${cardLast4}`]] as const) : []),
          [isTransfer ? "Renovación sugerida (IVA incluido)" : "Se cobrará (IVA incluido)", amountLabel],
        ]}
      />
      <Cta href={manageUrl}>{isTransfer ? "Renovar mi pase" : "Administrar mi plan"}</Cta>
    </EmailLayout>
  );
}

/* 21 · Acceso en pausa o vencido -------------------------------------------------------- */

export interface AccessExpiredProps {
  name?: string;
  planName: string;
  paymentMode?: "transfer" | "stripe";
  updateCardUrl: string;
}

export const accessExpiredSubject = ({ paymentMode }: AccessExpiredProps) =>
  paymentMode === "transfer"
    ? "Tu pase de PitchLab terminó"
    : "Tu acceso completo a PitchLab está en pausa";

export function AccessExpiredEmail({
  name,
  planName,
  paymentMode = "stripe",
  updateCardUrl,
}: AccessExpiredProps) {
  const isTransfer = paymentMode === "transfer";
  return (
    <EmailLayout
      preview={
        isTransfer
          ? `Tu acceso a ${planName} terminó. Reactívalo por transferencia o cupón.`
          : `No pudimos cobrar ${planName}. Reactívalo cuando quieras.`
      }
    >
      <Eyebrow>Tu plan</Eyebrow>
      <Title>{isTransfer ? "Tu pase terminó" : "Tu acceso está en pausa"}</Title>
      <P>
        {greeting(name)}{" "}
        {isTransfer
          ? `Terminó el periodo de tu ${planName}. Tu bitácora, historial y preferencias siguen guardados; cuando quieras reactiva tu pase por transferencia SPEI o con un cupón.`
          : `No pudimos cobrar tu plan ${planName} y terminó el plazo de gracia. Tu bitácora y tu historial siguen contigo.`}
      </P>
      <Cta href={updateCardUrl}>{isTransfer ? "Activar mi pase" : "Reactivar mi plan"}</Cta>
    </EmailLayout>
  );
}
