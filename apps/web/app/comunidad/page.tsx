import React from "react";
import type { Metadata } from "next";
import { ComunidadPageSurface } from "@pitchlab/ui";
import { loadComunidadViewProps } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comunidad · PitchLab",
  description:
    "Comunidad de socios con récord verificado por PitchLab, tipstars oficiales y cómo aplicar.",
};

export default async function ComunidadPage(): Promise<React.JSX.Element> {
  const props = await loadComunidadViewProps();
  return <ComunidadPageSurface {...props} />;
}
