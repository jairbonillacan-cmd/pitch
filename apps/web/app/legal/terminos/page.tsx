import React from "react";
import { LegalShell } from "../../../src/client/legal-shell.js";

export default function TerminosPage(): React.JSX.Element {
  return (
    <LegalShell eyebrow="Documento preliminar · Beta" title="Términos de uso">
      <p>
        <strong>Nota preliminar:</strong> Este documento es un borrador informativo
        para la etapa de beta cerrada de PitchLab.
      </p>
      <h2>1. Naturaleza informativa del servicio</h2>
      <p>
        PitchLab es una plataforma de análisis estadístico deportivo. No somos
        casa de apuestas, no aceptamos depósitos, no colocamos jugadas ni
        intermediamos dinero bajo ninguna modalidad.
      </p>
      <h2>2. Sin garantía de resultados</h2>
      <p>
        Todas las probabilidades, momios justos y factores publicados en PitchLab
        son estimaciones matemáticas derivadas del historial deportivo. Ninguna
        estimación garantiza un resultado futuro ni constituye asesoría financiera
        o recomendación de apuesta.
      </p>
      <h2>3. Uso del código de invitación</h2>
      <p>
        El código de acceso a la beta cerrada es personal para socios e invitados
        de prueba. Nos reservamos el derecho de rotar o revocar códigos en caso
        de uso automatizado o abuso.
      </p>
    </LegalShell>
  );
}
