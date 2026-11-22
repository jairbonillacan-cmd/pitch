import { MEMBERSHIP_SPEC } from "@pitchlab/ui/spacetime-catalog";
import {
  OG_CARD_CONTENT_TYPE,
  OG_CARD_SIZE,
  renderEditorialOgCard,
} from "../../src/server/og-card-kit";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Pase PitchLab Ultra — Acceso total con 7 días de prueba gratis";
export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

export default function PrecioOpenGraphImage() {
  return renderEditorialOgCard({
    eyebrow: "Pase PitchLab Ultra",
    badge: "7 DÍAS SIN TARJETA",
    title: "Acceso completo a probabilidades, momio justo y comparativa multi-casa.",
    subtitle:
      "Precios en pesos mexicanos con IVA incluido, factura CFDI disponible y activación rápida vía SPEI.",
    stats: [
      { label: "Plan mensual", value: `$${MEMBERSHIP_SPEC.monthlyMxn} MXN`, tone: "accent" },
      {
        label: "Plan anual",
        value: `$${MEMBERSHIP_SPEC.annualMxn.toLocaleString("en-US")} MXN`,
        tone: "success",
      },
      { label: "Fiscal", value: "IVA + CFDI" },
    ],
    footnote: "pitchlab.mx/precio",
  });
}
