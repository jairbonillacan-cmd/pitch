import {
  OG_CARD_CONTENT_TYPE,
  OG_CARD_SIZE,
  renderEditorialOgCard,
} from "../../src/server/og-card-kit";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Resultados publicados y auditados en PitchLab";
export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

export default function ResultadosOpenGraphImage() {
  return renderEditorialOgCard({
    eyebrow: "Transparencia verificable",
    badge: "HISTORIAL ÍNTEGRO",
    title: "Resultados publicados antes del partido, aciertos y fallos incluidos.",
    subtitle:
      "Cada lectura queda congelada antes del inicio y se contrasta frente al marcador final sin ediciones posteriores.",
    stats: [
      { label: "Publicación", value: "Pre-saque", tone: "accent" },
      { label: "Integridad", value: "Sin editar", tone: "success" },
      { label: "Cierre", value: "Auditado" },
    ],
    footnote: "pitchlab.mx/resultados",
  });
}
