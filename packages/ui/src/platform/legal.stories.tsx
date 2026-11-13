import React from "react";
import type { Meta } from "@storybook/react-vite";
import { LegalDocumentSurface, type LegalSection } from "./public/LegalSurfaces";

const meta = {
  title: "PitchLab v4 / Legal",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const sections: LegalSection[] = [
  {
    id: "naturaleza-informativa",
    title: "1. Naturaleza informativa del servicio (+18)",
    body: (
      <p>
        PitchLab es una plataforma de análisis estadístico deportivo dirigida exclusivamente a personas mayores de
        18 años. No somos casa de apuestas, no aceptamos depósitos, no colocamos jugadas reales ni intermediamos
        dinero bajo ninguna modalidad.
      </p>
    ),
  },
  {
    id: "unidades-simuladas",
    title: "2. Unidades simuladas y sin garantía de resultados",
    body: (
      <p>
        Todas las probabilidades, momios justos y registros en bitácora operan en unidades simuladas. Ninguna
        estimación garantiza un resultado futuro.
      </p>
    ),
  },
  {
    id: "pase-y-cancelacion",
    title: "3. Pase PitchLab Ultra y cancelación",
    body: (
      <p>
        Consulta tu vigencia en <code>/app/account?tab=plan</code>.
      </p>
    ),
  },
  {
    id: "comunidad",
    title: "4. Reglas de comunidad y creadores",
    body: (
      <ul>
        <li>Sin promesas de acierto garantizado.</li>
        <li>Sin lenguaje abusivo, spam ni enlaces promocionales ajenos.</li>
      </ul>
    ),
  },
];

function Terminos() {
  return (
    <LegalDocumentSurface
      slug="terminos"
      eyebrow="Documento legal"
      title="Términos de uso"
      lede="Condiciones del servicio informativo de PitchLab, Pase PitchLab Ultra y reglas de comunidad."
      sections={sections}
    />
  );
}

function CortoSinIndice() {
  return (
    <LegalDocumentSurface
      slug="juego-responsable"
      eyebrow="Compromiso +18"
      title="Juego responsable y uso informativo"
      lede="Compromiso +18, principios de uso informativo, pausas voluntarias y líneas de ayuda en México."
      intro={<p>PitchLab está dirigido exclusivamente a personas mayores de 18 años.</p>}
      sections={sections.slice(0, 2)}
    />
  );
}

export const DocumentoOscuro = { globals: { theme: "dark" }, render: () => <Terminos /> };
export const DocumentoClaro = { globals: { theme: "light" }, render: () => <Terminos /> };
export const DocumentoCortoSinIndiceOscuro = { globals: { theme: "dark" }, render: () => <CortoSinIndice /> };
export const DocumentoCortoSinIndiceClaro = { globals: { theme: "light" }, render: () => <CortoSinIndice /> };
