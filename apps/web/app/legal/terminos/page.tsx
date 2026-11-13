import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Condiciones del servicio informativo de PitchLab, Pase PitchLab Ultra y reglas de comunidad.";

export const metadata: Metadata = {
  title: "Términos de uso · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/terminos" },
};

export default async function TerminosPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="terminos"
      eyebrow="Documento legal"
      title="Términos de uso"
      lede={DESCRIPTION}
      hasSession={hasSession}
      sections={[
        {
          id: "naturaleza-informativa",
          title: "1. Naturaleza informativa del servicio (+18)",
          body: (
            <p>
              PitchLab es una plataforma de análisis estadístico deportivo dirigida exclusivamente a
              personas mayores de 18 años. No somos casa de apuestas, no aceptamos depósitos, no
              colocamos jugadas reales ni intermediamos dinero bajo ninguna modalidad.
            </p>
          ),
        },
        {
          id: "unidades-simuladas",
          title: "2. Unidades simuladas y sin garantía de resultados",
          body: (
            <p>
              Todas las probabilidades, momios justos y registros en bitácora operan en unidades
              simuladas y provienen de modelos estadísticos e historial deportivo. Ninguna estimación
              garantiza un resultado futuro ni constituye asesoría financiera o recomendación de
              apuesta.
            </p>
          ),
        },
        {
          id: "pase-y-cancelacion",
          title: "3. Pase PitchLab Ultra y cancelación",
          body: (
            <p>
              La prueba promocional está sujeta a elegibilidad (una por persona). En Beta 1.0 puedes
              activar o extender tu pase mensual o anual mediante transferencia SPEI (sin cobros ni
              renovaciones automáticas), canjear cupones vigentes y consultar tu vigencia en{" "}
              <code>/app/account?tab=plan</code>. Cuando se active el cobro automático con tarjeta vía
              Stripe, podrás cancelar la renovación en esa misma sección.
            </p>
          ),
        },
        {
          id: "comunidad",
          title: "4. Reglas de comunidad y creadores",
          body: (
            <p>
              Queda prohibido publicar promesas de acierto garantizado, lenguaje abusivo, spam o
              enlaces promocionales ajenos a PitchLab. Los boletos sellados por socios y creadores se
              conservan íntegros tras el inicio del partido; nos reservamos el derecho de suspender
              cuentas que manipulen registros o incurran en abuso automatizado.
            </p>
          ),
        },
      ]}
    />
  );
}
