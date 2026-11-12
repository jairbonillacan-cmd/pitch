import React from "react";
import type { Metadata } from "next";
import { ParlaysPageSurface } from "@pitchlab/ui";
import { loadParlaysViewProps } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Parlays · PitchLab",
  description:
    "Armador de parlays de 2 a 6 selecciones con probabilidad combinada y bloqueo de choques lógicos.",
};

export default async function ParlaysPage(): Promise<React.JSX.Element> {
  const props = await loadParlaysViewProps();
  return <ParlaysPageSurface {...props} />;
}
