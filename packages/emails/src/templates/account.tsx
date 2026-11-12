import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, FallbackLink, greeting, Notice, P, Steps, Title } from "../components";
import { EmailLayout } from "../layout";

/* 1 · Enlace de acceso ------------------------------------------------------------------ */

export interface MagicLinkProps {
  url: string;
  /** Minutos de vigencia del enlace. */
  minutes?: number;
}

export const magicLinkSubject = () => "Tu acceso a PitchLab";

export function MagicLinkEmail({ url, minutes = 15 }: MagicLinkProps) {
  return (
    <EmailLayout preview={`Tu enlace para entrar a PitchLab. Vence en ${minutes} minutos.`}>
      <Eyebrow>Acceso</Eyebrow>
      <Title>Entra a PitchLab</Title>
      <P>
        Da clic en el botón para entrar sin contraseña. El enlace vence en {minutes} minutos y solo funciona una vez.
      </P>
      <Cta href={url}>Entrar a PitchLab</Cta>
      <FallbackLink href={url} />
      <Notice tone="info">Si no lo pediste, ignora este correo: sin este enlace nadie entra a tu cuenta.</Notice>
    </EmailLayout>
  );
}

/* 2 · Bienvenida (día 0) ---------------------------------------------------------------- */

export interface WelcomeProps {
  name?: string;
  /** Días de prueba. `null` si la persona no recibió prueba (ya la usó antes). */
  trialDays?: number | null;
  appUrl?: string;
}

export const welcomeSubject = () => "Bienvenido a PitchLab";

export function WelcomeEmail({ name, trialDays = 7, appUrl = `${siteUrl()}/app` }: WelcomeProps) {
  return (
    <EmailLayout
      preview={trialDays ? `Tu cuenta está lista. Tienes ${trialDays} días de prueba, sin tarjeta.` : "Tu cuenta está lista."}
    >
      <Eyebrow>Bienvenida</Eyebrow>
      <Title>Bienvenido a PitchLab</Title>
      <P>
        {greeting(name)} Tu cuenta está lista
        {trialDays ? ` y tienes ${trialDays} días de prueba, sin tarjeta` : ""}. Empieza por aquí:
      </P>
      <Steps
        items={[
          "Abre un partido y revisa su resultado más probable.",
          "Compara el momio justo con el de tu casa: si tu casa paga más, hay valor.",
          "Guarda tu pick en la bitácora y mira cómo le fue contra el cierre.",
        ]}
      />
      <Cta href={appUrl}>Ir a mis partidos</Cta>
    </EmailLayout>
  );
}

/* 3 · Quedan 2 días (día 5) ------------------------------------------------------------- */

export interface TrialEndingProps {
  name?: string;
  daysLeft?: number;
  planName: string;
  /** Ya con IVA, por ejemplo «$299 MXN al mes, IVA incluido». */
  priceLabel: string;
  endsOn: string;
  manageUrl: string;
  /** Si no hay tarjeta guardada no se cobra nada: el correo lo dice. */
  hasCard?: boolean;
}

export const trialEndingSubject = ({ daysLeft = 2 }: TrialEndingProps) =>
  `Tu prueba de PitchLab termina en ${daysLeft} días`;

export function TrialEndingEmail({
  name,
  daysLeft = 2,
  planName,
  priceLabel,
  endsOn,
  manageUrl,
  hasCard = false,
}: TrialEndingProps) {
  return (
    <EmailLayout preview={`Quedan ${daysLeft} días de tu prueba. Esto es lo que pasa después.`}>
      <Eyebrow>Tu prueba</Eyebrow>
      <Title>Quedan {daysLeft} días de tu prueba</Title>
      <P>{greeting(name)} Tu prueba de {planName} termina el {endsOn}. Esto es lo que pasa después:</P>
      <Facts
        rows={[
          ["Plan", planName],
          ["Termina", endsOn],
          ["Precio", priceLabel],
          ["Cobro automático", hasCard ? "Sí, a la tarjeta guardada" : "No, no hay tarjeta"],
        ]}
      />
      <P>
        {hasCard
          ? "Si no quieres continuar, cancela antes de esa fecha y no se te cobra nada."
          : "Si no haces nada, al terminar tu prueba se pausa el acceso completo. No se te cobra nada."}
      </P>
      <Cta href={manageUrl}>{hasCard ? "Administrar mi plan" : "Elegir mi plan"}</Cta>
    </EmailLayout>
  );
}

/* 4 · Fin de la prueba (día 7) ---------------------------------------------------------- */

export interface TrialEndedProps {
  name?: string;
  outcome: "free" | "renewed";
  planName: string;
  /** Solo si `outcome` es «renewed». */
  chargedLabel?: string;
  nextChargeOn?: string;
  manageUrl: string;
}

export const trialEndedSubject = ({ outcome }: TrialEndedProps) =>
  outcome === "renewed" ? "Tu plan de PitchLab está activo" : "Tu prueba de PitchLab terminó";

export function TrialEndedEmail({ name, outcome, planName, chargedLabel, nextChargeOn, manageUrl }: TrialEndedProps) {
  if (outcome === "renewed") {
    return (
      <EmailLayout preview={`Tu plan ${planName} está activo.`}>
        <Eyebrow>Tu plan</Eyebrow>
      <Title>Tu plan está activo</Title>
        <P>{greeting(name)} Tu prueba terminó y ya tienes {planName}.</P>
        <Facts
          rows={[
            ["Plan", planName],
            ...(chargedLabel ? ([["Cobro de hoy", chargedLabel]] as const) : []),
            ...(nextChargeOn ? ([["Próximo cobro", nextChargeOn]] as const) : []),
          ]}
        />
        <P muted>Puedes cancelar cuando quieras desde tu cuenta. Conservas el acceso hasta el final del periodo pagado.</P>
        <Cta href={manageUrl}>Ver mi plan</Cta>
      </EmailLayout>
    );
  }
  return (
    <EmailLayout preview="Tu periodo de prueba terminó. Tu bitácora y tu historial se quedan contigo.">
      <Eyebrow>Tu prueba</Eyebrow>
      <Title>Tu prueba terminó</Title>
      <P>
        {greeting(name)} Tu periodo de prueba terminó y no se te cobró nada. Tu bitácora y tu historial se quedan
        contigo.
      </P>
      <P>Si quieres recuperar el acceso completo, activa tu plan cuando quieras.</P>
      <Cta href={manageUrl}>Activar mi plan</Cta>
    </EmailLayout>
  );
}

/* 15 · Aviso de seguridad --------------------------------------------------------------- */

export interface SecurityNoticeProps {
  name?: string;
  kind: "new-device" | "account-linked" | "account-unlinked";
  /** «Google», «Apple» o «X», para los avisos de cuentas vinculadas. */
  provider?: string;
  device?: string;
  location?: string;
  when: string;
  secureUrl: string;
}

export const securityNoticeSubject = ({ kind }: SecurityNoticeProps) =>
  kind === "new-device"
    ? "Nuevo inicio de sesión en tu cuenta de PitchLab"
    : kind === "account-linked"
      ? "Vinculaste una cuenta a PitchLab"
      : "Desvinculaste una cuenta de PitchLab";

export function SecurityNoticeEmail({ name, kind, provider, device, location, when, secureUrl }: SecurityNoticeProps) {
  const headline =
    kind === "new-device"
      ? "Nuevo inicio de sesión"
      : kind === "account-linked"
        ? `Vinculaste ${provider ?? "una cuenta"}`
        : `Desvinculaste ${provider ?? "una cuenta"}`;
  const rows: Array<readonly [string, string]> = [["Cuándo", when]];
  if (device) rows.push(["Dispositivo", device]);
  if (location) rows.push(["Ubicación aproximada", location]);
  return (
    <EmailLayout preview={`${headline}. Si fuiste tú, no tienes que hacer nada.`}>
      <Eyebrow>Seguridad</Eyebrow>
      <Title>{headline}</Title>
      <P>
        {greeting(name)}{" "}
        {kind === "new-device"
          ? "Entraron a tu cuenta desde un dispositivo que no habíamos visto."
          : "Hubo un cambio en las formas de entrar a tu cuenta."}
      </P>
      <Facts rows={rows} />
      <Notice tone="warning">
        Si fuiste tú, no tienes que hacer nada. Si no reconoces esto, cierra todas tus sesiones desde tu cuenta.
      </Notice>
      <Cta href={secureUrl}>Revisar mi cuenta</Cta>
    </EmailLayout>
  );
}
