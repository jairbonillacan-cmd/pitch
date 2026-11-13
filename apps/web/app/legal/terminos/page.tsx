import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Términos de uso · PitchLab",
  description:
    "Condiciones del servicio informativo de PitchLab, Pase PitchLab Ultra y reglas de comunidad.",
};

export default async function TerminosPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <PublicSiteShell hasSession={hasSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <article className="glass-lens glass-ring rounded-2xl p-6 sm:p-8 legal-doc space-y-4">
          <div>
            <p className="eyebrow">Documento legal</p>
            <h1>Términos de uso</h1>
          </div>
          <h2>1. Naturaleza informativa del servicio (+18)</h2>
          <p>
            PitchLab es una plataforma de análisis estadístico deportivo dirigida exclusivamente a
            personas mayores de 18 años. No somos casa de apuestas, no aceptamos depósitos, no
            colocamos jugadas reales ni intermediamos dinero bajo ninguna modalidad.
          </p>
          <h2>2. Unidades simuladas y sin garantía de resultados</h2>
          <p>
            Todas las probabilidades, momios justos y registros en bitácora operan en unidades
            simuladas y provienen de modelos estadísticos e historial deportivo. Ninguna estimación
            garantiza un resultado futuro ni constituye asesoría financiera o recomendación de
            apuesta.
          </p>
          <h2>3. Pase PitchLab Ultra y cancelación</h2>
          <p>
            La prueba promocional está sujeta a elegibilidad (una por persona). En Beta 1.0 puedes
            activar o extender tu pase mensual o anual mediante transferencia SPEI (sin cobros ni
            renovaciones automáticas), canjear cupones vigentes y consultar tu vigencia en{" "}
            <code>/app/account?tab=plan</code>. Cuando se active el cobro automático con tarjeta vía
            Stripe, podrás cancelar la renovación en esa misma sección.
          </p>
          <h2 id="comunidad">4. Reglas de comunidad y creadores</h2>
          <p>
            Queda prohibido publicar promesas de acierto garantizado, lenguaje abusivo, spam o
            enlaces promocionales ajenos a PitchLab. Los boletos sellados por socios y creadores se
            conservan íntegros tras el inicio del partido; nos reservamos el derecho de suspender
            cuentas que manipulen registros o incurran en abuso automatizado.
          </p>
        </article>
      </div>
    </PublicSiteShell>
  );
}
