import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Cómo protege y utiliza PitchLab los datos de tu cuenta, pagos y preferencias de correo.";

export const metadata: Metadata = {
  title: "Aviso de privacidad · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/privacidad" },
};

export default async function PrivacidadPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="privacidad"
      eyebrow="Documento legal"
      title="Aviso de privacidad"
      lede={DESCRIPTION}
      hasSession={hasSession}
      intro={
        <p>
          <strong>Alcance:</strong> Este aviso describe el tratamiento de datos personales en
          PitchLab. Si tienes dudas adicionales sobre privacidad o ejercicio de derechos ARCO,
          escríbenos a <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
        </p>
      }
      sections={[
        {
          id: "datos-que-tratamos",
          title: "1. Datos que tratamos",
          body: (
            <p>
              Cuando creas una cuenta en PitchLab almacenamos tu correo electrónico, nombre visible,
              handle (<code>@usuario</code>), verificación de mayoría de edad (+18), bitácora de
              picks simulados y preferencias dentro de la aplicación (ligas, zona horaria, formato de
              momios y avisos).
            </p>
          ),
        },
        {
          id: "pagos-y-correos",
          title: "2. Pagos y correos",
          body: (
            <p>
              En Beta 1.0 los pagos del Pase PitchLab Ultra se gestionan por transferencia SPEI sin
              almacenar tarjetas ni generar cargos automáticos; cuando esté habilitado el cobro con
              tarjeta, se procesará mediante Stripe sin que PitchLab guarde números completos ni
              códigos CVV. Los correos transaccionales y alertas de picks liquidados se envían
              mediante Resend y puedes activar o desactivar alertas en cualquier momento desde tu
              cuenta o en <code>/baja</code>.
            </p>
          ),
        },
        {
          id: "cookies-y-terceros",
          title: "3. Cookies y terceros",
          body: (
            <p>
              Utilizamos cookies técnicas firmadas para mantener tu sesión y preferencias visuales. No
              vendemos tus datos a terceros comercializadores ni recibimos comisiones por afiliación
              con casas de apuestas.
            </p>
          ),
        },
      ]}
    />
  );
}
