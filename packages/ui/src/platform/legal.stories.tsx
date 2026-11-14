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
      eyebrow="Documento legal · México"
      title="Términos de uso"
      lede="Condiciones del servicio de análisis estadístico deportivo en México (+18), cobro por transferencia SPEI, cupones de acceso y reglas de comunidad."
      lastUpdated="Última actualización: noviembre de 2026"
      sections={sections}
    />
  );
}

const privacidadSections: LegalSection[] = [
  {
    id: "responsable",
    title: "1. Identidad y domicilio del Responsable (LFPDPPP)",
    body: (
      <p>
        Aviso de Privacidad Integral conforme a la LFPDPPP en México. Contacto oficial para dudas y
        derechos ARCO: <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
      </p>
    ),
  },
  {
    id: "cobro-spei-privacidad",
    title: "2. Transferencias SPEI y cupones personales",
    body: (
      <p>
        Asignamos una referencia única ligada a tu cuenta (<code>PL-...</code>) y enviamos desde{" "}
        <code>noreply@pitchlab.mx</code> un cupón personal de un solo uso con vigencia de 30 días.
        No almacenamos números de tarjeta ni CVV.
      </p>
    ),
  },
  {
    id: "perfil-publico-privacidad",
    title: "3. Perfil público, Mi récord y Ranking",
    body: (
      <p>
        Tú eliges en <code>/app/account?tab=prefs</code> y <code>/app/lab</code> qué métricas en
        unidades simuladas compartir. Tu correo, fecha de nacimiento, banca en MXN y picks abiertos
        jamás son públicos.
      </p>
    ),
  },
  {
    id: "derechos-arco",
    title: "4. Derechos ARCO, descarga JSON y baja",
    body: (
      <p>
        Plazo máximo de 20 días hábiles para comunicar determinación y 15 días hábiles para hacerla
        efectiva, además de descarga inmediata en JSON y solicitud de baja en preferencias.
      </p>
    ),
  },
];

function Privacidad() {
  return (
    <LegalDocumentSurface
      slug="privacidad"
      eyebrow="Aviso de Privacidad Integral · México"
      title="Aviso de privacidad"
      lede="Tratamiento de datos conforme a la LFPDPPP, cobro SPEI, cookies técnicas, analítica opcional y derechos ARCO."
      lastUpdated="Última actualización: noviembre de 2026"
      sections={privacidadSections}
    />
  );
}

function CortoSinIndice() {
  return (
    <LegalDocumentSurface
      slug="juego-responsable"
      eyebrow="Compromiso +18 · México"
      title="Juego responsable y uso informativo"
      lede="Compromiso +18, principios de uso informativo, pausas voluntarias y líneas de ayuda en México."
      lastUpdated="Última actualización: noviembre de 2026"
      intro={<p>PitchLab está dirigido exclusivamente a personas mayores de 18 años.</p>}
      sections={sections.slice(0, 2)}
    />
  );
}

export const DocumentoOscuro = { globals: { theme: "dark" }, render: () => <Terminos /> };
export const DocumentoClaro = { globals: { theme: "light" }, render: () => <Terminos /> };
export const PrivacidadArcoOscuro = { globals: { theme: "dark" }, render: () => <Privacidad /> };
export const PrivacidadArcoClaro = { globals: { theme: "light" }, render: () => <Privacidad /> };
export const DocumentoCortoSinIndiceOscuro = { globals: { theme: "dark" }, render: () => <CortoSinIndice /> };
export const DocumentoCortoSinIndiceClaro = { globals: { theme: "light" }, render: () => <CortoSinIndice /> };
