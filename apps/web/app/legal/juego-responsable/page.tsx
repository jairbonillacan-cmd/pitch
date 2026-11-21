import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui/legal";

export const revalidate = 3600;

const DESCRIPTION =
  "Compromiso +18 en México, diferencia entre análisis estadístico y apuesta, controles de pausa voluntaria en tu cuenta y líneas gratuitas de ayuda.";

export const metadata: Metadata = {
  title: "Juego responsable (+18) · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/juego-responsable" },
};

export default function JuegoResponsablePage(): React.JSX.Element {
  return (
    <LegalDocumentSurface
      slug="juego-responsable"
      eyebrow="Compromiso +18 · México"
      title="Juego responsable y uso informativo"
      lede={DESCRIPTION}
      lastUpdated="Última actualización: noviembre de 2026"
      intro={
        <p>
          PitchLab está dirigido exclusivamente a personas <strong>mayores de 18 años</strong> con
          interés en la estadística y el análisis deportivo. Nuestro objetivo es ofrecer contexto
          cuantitativo transparente, nunca incentivar conductas de riesgo.
        </p>
      }
      sections={[
        {
          id: "mayoria-edad-y-alcance",
          title: "1. Exclusivo para mayores de 18 años y sin recepción de apuestas",
          body: (
            <p>
              Durante el registro verificamos la mayoría de edad (+18) y rechazamos la creación de
              cuentas de menores. <strong>PitchLab no es casa de apuestas:</strong> no recibimos
              depósitos para jugar, no colocamos boletos por cuenta del usuario, no pagamos premios
              monetarios y no incluimos enlaces de afiliados ni bonos de casas de apuestas.
            </p>
          ),
        },
        {
          id: "principios",
          title: "2. Principios de criterio y uso responsable",
          body: (
            <ul>
              <li>
                <strong>Entiende la probabilidad:</strong> ningún modelo predice el futuro con
                certeza; incluso un escenario con 75 % de probabilidad estimada no se cumplirá en
                aproximadamente 1 de cada 4 ocasiones a largo plazo.
              </li>
              <li>
                <strong>Protege tu economía personal:</strong> jamás comprometas dinero destinado a
                vivienda, alimentación, salud, educación, ahorro o pago de deudas, ni intentes
                «recuperar pérdidas».
              </li>
              <li>
                <strong>Separa el análisis del impulso:</strong> utiliza la bitácora en unidades
                simuladas para evaluar tu criterio con calma antes del partido, sin presión social.
              </li>
            </ul>
          ),
        },
        {
          id: "controles-en-pitchlab",
          title: "3. Controles de descanso disponibles hoy en tu cuenta",
          body: (
            <>
              <p>
                Desde <code>/app/account?tab=prefs</code> puedes activar en cualquier momento estas
                medidas reales de autocontrol:
              </p>
              <ul>
                <li>
                  <strong>Descanso voluntario temporal:</strong> pausa tu cuenta por{" "}
                  <strong>24 horas</strong>, <strong>7 días</strong> o <strong>30 días</strong> para
                  suspender alertas y avisos durante el periodo elegido.
                </li>
                <li>
                  <strong>Pausar Comunidad:</strong> oculta tus publicaciones, te retira del Ranking
                  y detiene notificaciones sociales sin perder tu historial privado.
                </li>
                <li>
                  <strong>Ocultar equivalencia en pesos:</strong> mantén tu bitácora expresada solo
                  en unidades simuladas (<code>u</code>), sin montos referenciales en MXN.
                </li>
                <li>
                  <strong>Eliminación definitiva de cuenta:</strong> solicita la baja total de tu
                  cuenta desde la sección <em>Tu cuenta</em> en preferencias o escribiendo a{" "}
                  <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "lineas-de-orientacion",
          title: "4. Líneas gratuitas de orientación y ayuda en México",
          body: (
            <>
              <p>
                Si tú o alguien cercano experimenta ansiedad, pérdida de control o dificultades
                relacionadas con el juego con apuesta, existen servicios públicos, gratuitos y
                confidenciales en México:
              </p>
              <ul>
                <li>
                  <strong>Línea de la Vida (CONASAMA · Secretaría de Salud):</strong>{" "}
                  <a href="tel:8009112000">800 911 2000</a> (atención gratuita y confidencial las 24
                  horas, los 365 días del año en todo México).
                </li>
                <li>
                  <strong>Centros de Integración Juvenil (CIJ):</strong> orientación psicológica y
                  familiar en el <a href="tel:5552121212">55 5212 1212</a>.
                </li>
                <li>
                  <strong>Dirección General de Juegos y Sorteos (SEGOB):</strong> información
                  oficial sobre atención a la ludopatía y regulación en México en{" "}
                  <a
                    href="http://www.juegosysorteos.gob.mx"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    juegosysorteos.gob.mx
                  </a>
                  .
                </li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
