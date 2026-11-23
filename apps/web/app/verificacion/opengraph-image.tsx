import {
  OG_CARD_CONTENT_TYPE,
  OG_CARD_SIZE,
  renderEditorialOgCard,
} from "../../src/server/og-card-kit";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Verificación criptográfica SHA-256 local en PitchLab";
export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

export default function VerificacionOpenGraphImage() {
  return renderEditorialOgCard({
    eyebrow: "Auditoría criptográfica",
    badge: "SHA-256 · WEBCRYPTO",
    title: "Comprueba la huella SHA-256 de cualquier recibo en tu navegador.",
    subtitle:
      "Recálculo determinista directamente en tu dispositivo para validar que ninguna selección fue alterada después del saque.",
    stats: [
      { label: "Ejecución", value: "100 % local", tone: "success" },
      { label: "Algoritmo", value: "SHA-256", tone: "accent" },
      { label: "Privacidad", value: "Cero envíos" },
    ],
    footnote: "pitchlab.mx/verificacion",
  });
}
