import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aviso de privacidad · PitchLab",
  description:
    "Cómo protege y utiliza PitchLab los datos de tu cuenta, pagos y preferencias de correo.",
};

export default async function PrivacidadPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <PublicSiteShell hasSession={hasSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <article className="glass-lens glass-ring rounded-2xl p-6 sm:p-8 legal-doc space-y-4">
          <div>
            <p className="eyebrow">Documento legal</p>
            <h1>Aviso de privacidad</h1>
          </div>
          <p>
            <strong>Alcance:</strong> Este aviso describe el tratamiento de datos personales en
            PitchLab. Si tienes dudas adicionales sobre privacidad o ejercicio de derechos ARCO,
            escríbenos a{" "}
            <a
              href="mailto:soporte@pitchlab.mx"
              style={{ color: "var(--pl-brand)", fontWeight: 600 }}
            >
              soporte@pitchlab.mx
            </a>
            .
          </p>
          <h2>1. Datos que tratamos</h2>
          <p>
            Cuando creas una cuenta en PitchLab almacenamos tu correo electrónico, nombre visible,
            handle (<code>@usuario</code>), verificación de mayoría de edad (+18), bitácora de
            picks simulados y preferencias dentro de la aplicación (ligas, zona horaria, formato de
            momios y avisos).
          </p>
          <h2>2. Pagos y correos</h2>
          <p>
            En Beta 1.0 los pagos del Pase PitchLab Ultra se gestionan por transferencia SPEI sin
            almacenar tarjetas ni generar cargos automáticos; cuando esté habilitado el cobro con
            tarjeta, se procesará mediante Stripe sin que PitchLab guarde números completos ni
            códigos CVV. Los correos transaccionales y alertas de picks liquidados se envían
            mediante Resend y puedes activar o desactivar alertas en cualquier momento desde tu
            cuenta o en <code>/baja</code>.
          </p>
          <h2>3. Cookies y terceros</h2>
          <p>
            Utilizamos cookies técnicas firmadas para mantener tu sesión y preferencias visuales. No
            vendemos tus datos a terceros comercializadores ni recibimos comisiones por afiliación
            con casas de apuestas.
          </p>
        </article>
      </div>
    </PublicSiteShell>
  );
}
