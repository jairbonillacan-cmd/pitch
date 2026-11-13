import React from "react";
import type { Metadata } from "next";
import { hasPublicSessionCookie } from "../../src/server/public-session";
import { ComunidadPageSurface } from "@pitchlab/ui";
import { loadComunidadViewProps } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comunidad · PitchLab",
  description:
    "Comunidad de socios con récord verificado por PitchLab, tipsters oficiales y cómo aplicar.",
};

export default async function ComunidadPage(): Promise<React.JSX.Element> {
  const [props, hasSession] = await Promise.all([loadComunidadViewProps(), hasPublicSessionCookie()]);
  return <ComunidadPageSurface {...props} hasSession={hasSession} />;
}
