import {
  OG_CARD_CONTENT_TYPE,
  OG_CARD_SIZE,
  renderEditorialOgCard,
} from "../src/server/og-card-kit";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "PitchLab — Probabilidad estimada y momio justo antes del partido";
export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

export default function HomeOpenGraphImage() {
  return renderEditorialOgCard({
    eyebrow: "Análisis cuantitativo deportivo",
    badge: "MODELO CALIBRADO",
    title: "Lo más probable de cada partido, con su momio justo.",
    subtitle:
      "Compara nuestra estimación previa contra la cuota de tu casa y lleva un récord auditable antes del saque.",
    stats: [
      { label: "Cobertura", value: "5 deportes", tone: "accent" },
      { label: "Ligas", value: "57 activas" },
      { label: "Auditoría", value: "Pública", tone: "success" },
      { label: "Registro", value: "Sellado" },
    ],
    footnote: "pitchlab.mx",
  });
}
