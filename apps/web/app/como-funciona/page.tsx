import React from "react";
import type { Metadata } from "next";
import { ComoFuncionaPageSurface } from "@pitchlab/ui";
import { loadComoFuncionaViewProps } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cómo funciona · PitchLab",
  description:
    "Tres números en cada partido: la probabilidad, el momio justo y el comparador con tu momio. Ejemplos reales por liga.",
};

export default async function ComoFuncionaPage(): Promise<React.JSX.Element> {
  const props = await loadComoFuncionaViewProps();
  return <ComoFuncionaPageSurface {...props} />;
}
