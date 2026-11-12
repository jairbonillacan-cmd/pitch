import React from "react";
import type { Metadata } from "next";
import { hasPublicSessionCookie } from "../../src/server/public-session";
import { ResultadosPageSurface } from "@pitchlab/ui";
import { loadResultadosViewProps } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultados · PitchLab",
  description:
    "Historial íntegro de partidos terminados, publicado antes del inicio y sin editar después, con lo que se cumplió y lo que no.",
};

export default async function ResultadosPage(): Promise<React.JSX.Element> {
  const [props, hasSession] = await Promise.all([loadResultadosViewProps(), hasPublicSessionCookie()]);
  return <ResultadosPageSurface {...props} hasSession={hasSession} />;
}
