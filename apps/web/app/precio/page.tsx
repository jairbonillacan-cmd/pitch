import React from "react";
import type { Metadata } from "next";
import { PrecioPageSurface } from "@pitchlab/ui";

export const metadata: Metadata = {
  title: "Precio · PitchLab",
  description:
    "Pase PitchLab Ultra mensual o anual: todos los partidos, mercados, parlays y comunidad. 7 días gratis, sin tarjeta, IVA incluido y factura CFDI.",
};

export default function PrecioPage(): React.JSX.Element {
  return <PrecioPageSurface />;
}
