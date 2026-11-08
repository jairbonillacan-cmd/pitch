import React from "react";
import { LegalShell } from "../../../src/client/legal-shell.js";

export default function JuegoResponsablePage(): React.JSX.Element {
  return (
    <LegalShell
      eyebrow="Compromiso +18"
      title="Juego responsable y uso informativo"
    >
      <p>
        PitchLab está dirigido exclusivamente a personas mayores de 18 años con
        interés en la estadística y el análisis deportivo.
      </p>
      <h2>Principios de uso responsable</h2>
      <ul>
        <li>
          Entiende la probabilidad: incluso un evento con 75% de probabilidad
          falla 1 de cada 4 veces en el largo plazo.
        </li>
        <li>
          Nunca utilices dinero destinado a gastos esenciales ni busques
          recuperar pérdidas.
        </li>
        <li>
          PitchLab no vende «picks seguros» ni promueve enlaces de afiliados a
          casas de apuestas.
        </li>
      </ul>
      <h2>Líneas de orientación en México</h2>
      <p>
        Si tú o alguien cercano necesita orientación sobre ludopatía, puedes
        comunicarte sin costo a la Línea de la Vida (800 911 2000) o consultar
        los servicios de atención ciudadana de SEGOB.
      </p>
    </LegalShell>
  );
}
