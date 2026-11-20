import "../record-v2.css";
import React from "react";
import type { Metadata } from "next";
import { ResultadosPageSurface } from "@pitchlab/ui/public-sections";
import { loadResultadosViewProps } from "../../src/server/public-site-data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Resultados · PitchLab",
  description:
    "Historial íntegro de partidos terminados, publicado antes del inicio y sin editar después, con lo que se cumplió y lo que no.",
};

export default async function ResultadosPage(): Promise<React.JSX.Element> {
  const props = await loadResultadosViewProps();
  return <ResultadosPageSurface {...props} />;
}
