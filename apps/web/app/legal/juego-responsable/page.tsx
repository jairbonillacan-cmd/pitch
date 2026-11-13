import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Compromiso +18, principios de uso informativo, pausas voluntarias y líneas de ayuda en México.";

export const metadata: Metadata = {
  title: "Juego responsable (+18) · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/juego-responsable" },
};

export default async function JuegoResponsablePage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="juego-responsable"
      eyebrow="Compromiso +18"
      title="Juego responsable y uso informativo"
      lede={DESCRIPTION}
      hasSession={hasSession}
      intro={
        <p>
          PitchLab está dirigido exclusivamente a personas mayores de 18 años con interés en la
          estadística y el análisis deportivo.
        </p>
      }
      sections={[
        {
          id: "principios",
          title: "Principios de uso responsable",
          body: (
            <ul>
              <li>
                Entiende la probabilidad: incluso un evento con 75 % de probabilidad estimada puede no
                cumplirse en el largo plazo.
              </li>
              <li>Nunca utilices dinero destinado a gastos esenciales ni busques recuperar pérdidas.</li>
              <li>
                PitchLab no vende garantías ni promueve enlaces de afiliados a casas de apuestas. Si
                necesitas un descanso, puedes activar una pausa desde <code>/app/account?tab=prefs</code>.
              </li>
            </ul>
          ),
        },
        {
          id: "lineas-de-orientacion",
          title: "Líneas de orientación en México",
          body: (
            <p>
              Si tú o alguien cercano necesita orientación sobre ludopatía, puedes comunicarte sin
              costo a la Línea de la Vida (<a href="tel:8009112000">800 911 2000</a>) o consultar los
              servicios de atención ciudadana de SEGOB.
            </p>
          ),
        },
      ]}
    />
  );
}
