import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, greeting, P, Stat, Title } from "../components";
import { EmailLayout } from "../layout";

/* 18 · Código Tipster activo ------------------------------------------------------------ */

export interface TipsterActivatedProps {
  name?: string;
  promoCode: string;
  trialDays: number;
  /** En porcentaje: 25. */
  commissionPct: number;
  shareUrl: string;
  dashboardUrl?: string;
}

export const tipsterActivatedSubject = () => "Tu código de Tipster ya está activo";

export function TipsterActivatedEmail({
  name,
  promoCode,
  trialDays,
  commissionPct,
  shareUrl,
  dashboardUrl = `${siteUrl()}/app/tipstar`,
}: TipsterActivatedProps) {
  return (
    <EmailLayout preview={`Tu código ${promoCode} ya funciona.`}>
      <Eyebrow>Tipster</Eyebrow>
      <Title>Tu código ya está activo</Title>
      <P>
        {greeting(name)} Quien se registre con tu código recibe {trialDays} días gratis. Tú ganas el {commissionPct} %
        del neto de cada pago.
      </P>
      <Stat value={promoCode} label="Tu código" tone="brand" />
      <Facts
        rows={[
          ["Tu enlace", shareUrl.replace(/^https?:\/\//, "")],
          ["Prueba para tus invitados", `${trialDays} días`],
          ["Comisión", `${commissionPct} % del neto`],
          ["Liquidación", "A 14 días del cobro"],
        ]}
      />
      <Cta href={dashboardUrl}>Ver mi panel</Cta>
    </EmailLayout>
  );
}

/* 19 · Nueva suscripción con tu código -------------------------------------------------- */

export interface TipsterNewSubscriberProps {
  name?: string;
  promoCode: string;
  planName: string;
  commissionLabel: string;
  /** Base de la comisión: el cobro sin IVA ni comisión del procesador. */
  netLabel: string;
  payableOn: string;
  commissionsUrl?: string;
}

export const tipsterNewSubscriberSubject = () => "Nueva suscripción con tu código";

export function TipsterNewSubscriberEmail({
  name,
  promoCode,
  planName,
  commissionLabel,
  netLabel,
  payableOn,
  commissionsUrl = `${siteUrl()}/app/tipstar`,
}: TipsterNewSubscriberProps) {
  return (
    <EmailLayout preview={`Alguien se suscribió con ${promoCode}. Comisión: ${commissionLabel}.`}>
      <Eyebrow>Tipster</Eyebrow>
      <Title>Nueva suscripción con tu código</Title>
      <P>
        {greeting(name)} Alguien pagó {planName} con {promoCode}.
      </P>
      <Stat value={commissionLabel} label="Comisión por liquidar" />
      <Facts
        rows={[
          ["Base (neto del cobro)", netLabel],
          ["Disponible a partir del", payableOn],
        ]}
      />
      <Cta href={commissionsUrl}>Ver mis comisiones</Cta>
    </EmailLayout>
  );
}
