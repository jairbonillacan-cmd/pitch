import "../../atomic-kit.css";
import "../../momios-compare.css";
import React from "react";
import type { Metadata } from "next";
import { OddsCompareClubView } from "@pitchlab/ui/momios";

export const metadata: Metadata = {
  title: "Comparador de momios | PitchLab",
  description:
    "Matriz multi-casa anclada al momio justo de Spacetime v5.1 con señal de movimiento, valor esperado y convertidor de margen real.",
};

export default function ClubMomiosPage(): React.JSX.Element {
  return <OddsCompareClubView />;
}
