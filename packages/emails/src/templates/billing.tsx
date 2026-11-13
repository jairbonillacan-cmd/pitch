import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, greeting, Notice, P, Stat, Title } from "../components";
import { EmailLayout } from "../layout";

/* 8 · Pago confirmado ------------------------------------------------------------------- */

export interface PaymentReceiptProps {
  name?: string;
  planName: string;
  /** Ya con IVA: «$299.00 MXN». */
  amountLabel: string;
  paidOn: string;
  periodLabel: string;
  cardLast4?: string;
  paymentMethodLabel?: string;
  referenceCode?: string;
  receiptUrl?: string;
}

export const paymentReceiptSubject = ({ amountLabel }: PaymentReceiptProps) => `Recibimos tu pago de ${amountLabel}`;

export function PaymentReceiptEmail({
  name,
  planName,
  amountLabel,
  paidOn,
  periodLabel,
  cardLast4,
  paymentMethodLabel,
  referenceCode,
  receiptUrl,
}: PaymentReceiptProps) {
  return (
    <EmailLayout preview={`Pago confirmado: ${amountLabel} por ${planName}.`}>
      <Eyebrow>Cobro</Eyebrow>
      <Title>Pago confirmado</Title>
      <P>{greeting(name)} Recibimos tu pago.</P>
      <Stat value={amountLabel} label="Total pagado, IVA incluido" />
      <Facts
        rows={[
          ["Plan", planName],
          ["Periodo", periodLabel],
          ["Fecha de pago", paidOn],
          ...(cardLast4 ? ([["Tarjeta", `•••• ${cardLast4}`]] as const) : []),
          ...(paymentMethodLabel ? ([["Método", paymentMethodLabel]] as const) : []),
          ...(referenceCode ? ([["Referencia", referenceCode]] as const) : []),
        ]}
      />
      {receiptUrl ? <Cta href={receiptUrl}>Ver recibo</Cta> : null}
    </EmailLayout>
  );
}

/* 9 · Falló el pago --------------------------------------------------------------------- */

export interface PaymentFailedProps {
  name?: string;
  planName: string;
  amountLabel: string;
  /** Fin de la gracia (72 h). */
  graceUntil: string;
  updateCardUrl: string;
}

export const paymentFailedSubject = () => "No pudimos cobrar tu plan de PitchLab";

export function PaymentFailedEmail({ name, planName, amountLabel, graceUntil, updateCardUrl }: PaymentFailedProps) {
  return (
    <EmailLayout preview={`Actualiza tu tarjeta antes del ${graceUntil} para no perder el acceso.`}>
      <Eyebrow>Cobro</Eyebrow>
      <Title>No pudimos cobrar tu plan</Title>
      <P>
        {greeting(name)} Intentamos cobrar {amountLabel} de tu plan {planName} y el banco no lo aceptó.
      </P>
      <Stat value={amountLabel} label="No se pudo cobrar" tone="warning" />
      <Notice tone="warning">
        Conservas todo tu acceso hasta el {graceUntil}. Si para entonces no actualizas tu tarjeta, tu cuenta pasa a Free.
      </Notice>
      <Cta href={updateCardUrl}>Actualizar mi tarjeta</Cta>
    </EmailLayout>
  );
}

/* 10 · Factura CFDI --------------------------------------------------------------------- */

export interface CfdiInvoiceProps {
  name?: string;
  folio: string;
  amountLabel: string;
  issuedOn: string;
  /** Razón social con la que se emitió. */
  legalName: string;
  downloadUrl?: string;
}

export const cfdiInvoiceSubject = ({ folio }: CfdiInvoiceProps) => `Tu factura CFDI ${folio} de PitchLab`;

export function CfdiInvoiceEmail({ name, folio, amountLabel, issuedOn, legalName, downloadUrl }: CfdiInvoiceProps) {
  return (
    <EmailLayout preview={`Factura ${folio} por ${amountLabel}. PDF y XML adjuntos.`}>
      <Eyebrow>Facturación</Eyebrow>
      <Title>Tu factura está lista</Title>
      <P>{greeting(name)} Adjuntamos tu factura en PDF y XML (CFDI 4.0).</P>
      <Facts
        rows={[
          ["Folio", folio],
          ["Emitida", issuedOn],
          ["A nombre de", legalName],
          ["Total", amountLabel],
        ]}
      />
      {downloadUrl ? <Cta href={downloadUrl}>Descargar de nuevo</Cta> : null}
      <P muted>Guarda el XML: es el comprobante válido ante el SAT.</P>
    </EmailLayout>
  );
}

/* 11 · Reembolso o contracargo ---------------------------------------------------------- */

export interface RefundProps {
  name?: string;
  kind: "refund" | "dispute";
  amountLabel: string;
  happenedOn: string;
  /** El reembolso tarda en verse en el estado de cuenta. */
  arrivalNote?: string;
}

export const refundSubject = ({ kind }: RefundProps) =>
  kind === "refund" ? "Tu reembolso de PitchLab está en camino" : "Recibimos una disputa de tu pago";

export function RefundEmail({ name, kind, amountLabel, happenedOn, arrivalNote }: RefundProps) {
  return (
    <EmailLayout
      preview={kind === "refund" ? `Reembolso de ${amountLabel} procesado.` : `Disputa de ${amountLabel} recibida.`}
    >
      <Eyebrow>Cobro</Eyebrow>
      <Title>{kind === "refund" ? "Reembolso procesado" : "Recibimos una disputa de tu pago"}</Title>
      <P>
        {greeting(name)}{" "}
        {kind === "refund"
          ? "Ya procesamos tu reembolso."
          : "Tu banco nos avisó de una disputa sobre un cargo de PitchLab. Mientras se resuelve, pausamos el acceso de pago de tu cuenta."}
      </P>
      <Stat
        value={amountLabel}
        label={kind === "refund" ? `Reembolsado el ${happenedOn}` : `Disputado el ${happenedOn}`}
        tone={kind === "refund" ? "success" : "warning"}
      />
      {kind === "refund" ? (
        <P muted>{arrivalNote ?? "Puede tardar de 5 a 10 días hábiles en verse en tu estado de cuenta."}</P>
      ) : (
        <P muted>
          Si fue un error o ya lo resolviste con tu banco, respóndenos a este correo y lo revisamos contigo.
        </P>
      )}
    </EmailLayout>
  );
}

/* 12 · Suscripción cancelada ------------------------------------------------------------ */

export interface SubscriptionCanceledProps {
  name?: string;
  planName: string;
  accessUntil: string;
  resumeUrl?: string;
}

export const subscriptionCanceledSubject = () => "Cancelaste tu plan de PitchLab";

export function SubscriptionCanceledEmail({
  name,
  planName,
  accessUntil,
  resumeUrl = `${siteUrl()}/app/account`,
}: SubscriptionCanceledProps) {
  return (
    <EmailLayout preview={`Conservas ${planName} hasta el ${accessUntil}.`}>
      <Eyebrow>Tu plan</Eyebrow>
      <Title>Cancelaste tu plan</Title>
      <P>
        {greeting(name)} Tu plan {planName} no se renovará. Conservas todo el acceso hasta el {accessUntil}; después tu
        cuenta pasa a Free y tu bitácora se queda contigo.
      </P>
      <P>Si cambias de opinión, puedes reactivarlo antes de esa fecha sin perder nada.</P>
      <Cta href={resumeUrl}>Reactivar mi plan</Cta>
    </EmailLayout>
  );
}

/* 13 · Pago de comisión Tipster --------------------------------------------------------- */

export interface TipsterPayoutProps {
  name?: string;
  amountLabel: string;
  periodLabel: string;
  paidOn: string;
  referenceLabel?: string;
  detailUrl: string;
}

export const tipsterPayoutSubject = ({ amountLabel }: TipsterPayoutProps) => `Tu pago de comisión: ${amountLabel}`;

export function TipsterPayoutEmail({
  name,
  amountLabel,
  periodLabel,
  paidOn,
  referenceLabel,
  detailUrl,
}: TipsterPayoutProps) {
  return (
    <EmailLayout preview={`Liquidamos ${amountLabel} de tus comisiones de ${periodLabel}.`}>
      <Eyebrow>Tipster</Eyebrow>
      <Title>Liquidamos tu comisión</Title>
      <P>{greeting(name)} Ya enviamos el pago de tus comisiones como Tipster oficial.</P>
      <Stat value={amountLabel} label="Comisión liquidada" />
      <Facts
        rows={[
          ["Periodo", periodLabel],
          ["Fecha de pago", paidOn],
          ...(referenceLabel ? ([["Referencia", referenceLabel]] as const) : []),
        ]}
      />
      <Cta href={detailUrl}>Ver el detalle</Cta>
      <P muted>
        La comisión es del 25 % sobre el neto de cada cobro, liquidada a 14 días. Los reembolsos se descuentan del
        periodo en que ocurren.
      </P>
    </EmailLayout>
  );
}

/* 13b · Transferencia rechazada --------------------------------------------------------- */

export interface TransferRejectedProps {
  name?: string;
  planName: string;
  amountLabel: string;
  referenceCode: string;
  reason: string;
  retryUrl: string;
}

export const transferRejectedSubject = () => "No pudimos confirmar tu transferencia en PitchLab";

export function TransferRejectedEmail({
  name,
  planName,
  amountLabel,
  referenceCode,
  reason,
  retryUrl,
}: TransferRejectedProps) {
  return (
    <EmailLayout preview={`No pudimos confirmar tu transferencia ${referenceCode}. Revisa los detalles en tu cuenta.`}>
      <Eyebrow>Cobro</Eyebrow>
      <Title>No pudimos confirmar tu transferencia</Title>
      <P>
        {greeting(name)} Revisamos el aviso de transferencia para activar tu {planName}, pero no pudimos confirmarlo.
      </P>
      <Facts
        rows={[
          ["Plan", planName],
          ["Monto esperado", amountLabel],
          ["Referencia", referenceCode],
        ]}
      />
      <Notice tone="warning">{reason}</Notice>
      <Cta href={retryUrl}>Revisar mi plan</Cta>
    </EmailLayout>
  );
}
