import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Juego responsable (+18) · PitchLab",
  description:
    "Compromiso +18, principios de uso informativo, pausas voluntarias y líneas de ayuda en México.",
};

export default async function JuegoResponsablePage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <PublicSiteShell hasSession={hasSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <article className="glass-lens glass-ring rounded-2xl p-6 sm:p-8 legal-doc space-y-4">
          <div>
            <p className="eyebrow">Compromiso +18</p>
            <h1>Juego responsable y uso informativo</h1>
          </div>
          <p>
            PitchLab está dirigido exclusivamente a personas mayores de 18 años con interés en la
            estadística y el análisis deportivo.
          </p>
          <h2>Principios de uso responsable</h2>
          <ul>
            <li>
              Entiende la probabilidad: incluso un evento con 75 % de probabilidad estimada puede no
              cumplirse en el largo plazo.
            </li>
            <li>
              Nunca utilices dinero destinado a gastos esenciales ni busques recuperar pérdidas.
            </li>
            <li>
              PitchLab no vende garantías ni promueve enlaces de afiliados a casas de apuestas. Si
              necesitas un descanso, puedes activar una pausa desde{" "}
              <code>/app/account?tab=prefs</code>.
            </li>
          </ul>
          <h2>Líneas de orientación en México</h2>
          <p>
            Si tú o alguien cercano necesita orientación sobre ludopatía, puedes comunicarte sin
            costo a la Línea de la Vida (800 911 2000) o consultar los servicios de atención
            ciudadana de SEGOB.
          </p>
        </article>
      </div>
    </PublicSiteShell>
  );
}
